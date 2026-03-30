from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from typing import List, Optional
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import Document, DocumentStatus, User, VerificationLog
from backend.nlp.storage import client as minio_client, ensure_buckets
from backend.workers.tasks import process_document
import backend.nlp.taxonomy as taxonomy_store
import backend.nlp.field_schema_store as field_schema_store
import uuid
import asyncio
import os
import redis as redis_lib
import numpy as np

try:
    _redis = redis_lib.Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True)
    _redis.ping()
except Exception:
    class DummyRedis:
        def __init__(self): self.store = {}
        def hset(self, key, mapping=None, **kwargs):
            if key not in self.store: self.store[key] = {}
            if mapping: self.store[key].update(mapping)
            self.store[key].update(kwargs)
        def hgetall(self, key): 
            return self.store.get(key, {})
        def hincrby(self, key, field, amount=1):
            if key not in self.store: self.store[key] = {}
            val = int(self.store[key].get(field, 0)) + amount
            self.store[key][field] = str(val)
        def expire(self, key, time): pass
        def hget(self, key, field): return self.store.get(key, {}).get(field)
    _redis = DummyRedis()

router = APIRouter()

@router.post("/upload")
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    ensure_buckets()
    doc_id = str(uuid.uuid4())
    minio_path = f"{doc_id}_{file.filename}"

    try:
        # Since we use minio client without a fixed size stream, upload via file.read() for prototyping
        data = await file.read()
        import io
        minio_client.put_object(
            "documents", minio_path, io.BytesIO(data), length=len(data)
        )
        
        new_doc = Document(
            id=doc_id,
            filename=file.filename,
            minio_pdf_path=minio_path,
            status=DocumentStatus.PENDING
        )
        db.add(new_doc)
        db.commit()
        
        process_document.delay(doc_id)
        
        return {"document_id": doc_id, "status": "processing_started"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-batch")
async def upload_batch(files: List[UploadFile] = File(...), case_id: Optional[str] = None, db: Session = Depends(get_db)):
    ensure_buckets()
    results = []
    # If case_id is present, get the case once
    from backend.db.models import Case
    case = db.query(Case).filter_by(id=case_id).first() if case_id else None
    import io
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            results.append({"filename": file.filename, "error": "not a PDF"})
            continue
        doc_id = str(uuid.uuid4())
        minio_path = f"{doc_id}_{file.filename}"
        try:
            data = await file.read()
            minio_client.put_object("documents", minio_path, io.BytesIO(data), length=len(data))
            new_doc = Document(
                id=doc_id,
                filename=file.filename,
                minio_pdf_path=minio_path,
                status=DocumentStatus.PENDING,
                case_id=case_id if case else None,
            )
            db.add(new_doc)
            if case and new_doc not in case.documents:
                case.documents.append(new_doc)
            db.commit()
            process_document.delay(doc_id)
            results.append({"filename": file.filename, "document_id": doc_id})
        except Exception as e:
            db.rollback()
            results.append({"filename": file.filename, "error": str(e)})
    return {"uploaded": len([r for r in results if "document_id" in r]), "results": results}


@router.get("/documents/{doc_id}")
def get_document_status(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        "id": doc.id,
        "status": doc.status.value,
        # Phase 1 – zero-shot OCR temporary classification
        "temp_label":    doc.temp_label,
        "temp_category": doc.temp_category,
        "temp_score":    doc.temp_score,
        # Phase 2 – GPT-4o Vision authoritative result
        "llm_label":                doc.llm_label,
        "llm_category":             doc.llm_category,
        "llm_fields":               doc.llm_fields or {},
        "llm_classification_match": doc.llm_classification_match,
        "llm_notes":                doc.llm_notes,
        # Authoritative (mirrors LLM result; overwritten on human verification)
        "extracted_label":    doc.extracted_label,
        "extracted_category": doc.extracted_category,
        "extracted_date":     doc.extracted_date,
        "confidence_score":   doc.confidence_score,
        "extracted_fields":   doc.extracted_fields or {},
    }

@router.patch("/documents/{doc_id}")
def patch_document(doc_id: str, payload: dict, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if "extracted_label" in payload:
        doc.extracted_label = payload["extracted_label"]
    if "extracted_category" in payload:
        doc.extracted_category = payload["extracted_category"]
    if "extracted_date" in payload:
        doc.extracted_date = payload["extracted_date"]
    if "llm_notes" in payload:
        doc.llm_notes = payload["llm_notes"]
    
    if "extracted_fields" in payload:
        current = dict(doc.extracted_fields or {})
        current.update(payload["extracted_fields"])
        doc.extracted_fields = current
    
    doc.human_verified = True
    db.commit()
    return {"status": "updated", "document_id": doc_id}

@router.post("/documents/{doc_id}/verify")
def verify_document(
    doc_id: str,
    payload: dict,
    db: Session = Depends(get_db),
):
    """
    Expected payload:
    {
        'corrected_label': '...',
        'corrected_fields': {'mittente': '...', 'importo': '...'},  # only fields user changed
        'verification_time_ms': 1500
    }
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    original_label   = doc.extracted_label
    corrected_label  = payload.get("corrected_label", doc.extracted_label)
    corrected_fields = payload.get("corrected_fields", {})

    doc.extracted_label = corrected_label
    doc.extracted_date  = payload.get("corrected_date", doc.extracted_date)

    # Track which fields actually changed value
    fields_changed: dict = {}
    if corrected_fields:
        current = dict(doc.extracted_fields or {})
        for k, v in corrected_fields.items():
            old_val = current.get(k)
            if old_val != v:
                fields_changed[k] = {"from": old_val, "to": v}
        current.update(corrected_fields)
        doc.extracted_fields = current

    doc.human_verified = True
    if payload.get("verification_time_ms", 5000) < 2000:
        doc.verification_suspicious = True
    doc.status = DocumentStatus.VERIFIED

    # Audit log
    log = VerificationLog(
        document_id    = doc_id,
        user_id        = None,
        original_label = original_label,
        final_label    = corrected_label,
        label_changed  = (original_label != corrected_label),
        fields_changed = fields_changed or None,
    )
    db.add(log)
    db.commit()

    return {"status": "verified", "suspicious": doc.verification_suspicious}

@router.get("/documents/{doc_id}/stream")
async def stream_document_status(doc_id: str, db: Session = Depends(get_db)):
    async def event_generator():
        while True:
            # Expire cache so each iteration fetches fresh state from DB
            db.expire_all()
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if not doc:
                yield "event: error\ndata: Document not found\n\n"
                break
                
            import json
            prog = _redis.hgetall(f"progress:{doc_id}")
            payload = json.dumps({
                "status": doc.status.value if doc.status else "pending",
                "label": doc.extracted_label or "",
                "category": doc.extracted_category or "",
                "date": doc.extracted_date or "",
                "score": doc.confidence_score,
                "fields": doc.extracted_fields or {},
                "notes": doc.llm_notes or "",
                "progress_completed": int(prog.get("completed", 0)) if prog else 0,
                "progress_total": int(prog.get("total", 0)) if prog else 0,
                "progress_start": float(prog.get("start", 0)) if prog else 0,
            })
            yield f"data: {payload}\n\n"
            
            if doc.status in (DocumentStatus.NEEDS_REVIEW, DocumentStatus.VERIFIED, DocumentStatus.FAILED):
                break
                
            await asyncio.sleep(1.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/documents/{doc_id}/pdf")
def get_document_pdf(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        response = minio_client.get_object("documents", doc.minio_pdf_path)
        return StreamingResponse(
            response, 
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename={doc.filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/field-schema")
def get_field_schema():
    return {
        "schema": field_schema_store.load(),
        "available_fields": field_schema_store.AVAILABLE_FIELDS,
    }

@router.put("/field-schema/{label}")
def set_label_fields(label: str, payload: dict):
    fields = payload.get("fields", [])
    try:
        return field_schema_store.set_label_fields(label, fields)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/taxonomy")
def get_taxonomy():
    return taxonomy_store.load()

@router.post("/taxonomy/category")
def add_category(payload: dict):
    name = payload.get("name", "").strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Category name required")
    try:
        return taxonomy_store.add_category(name)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

@router.delete("/taxonomy/category/{name}")
def delete_category(name: str):
    try:
        return taxonomy_store.delete_category(name)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

@router.post("/taxonomy/label")
def add_label(payload: dict):
    category = payload.get("category", "").strip()
    label = payload.get("label", "").strip().lower()
    if not category or not label:
        raise HTTPException(status_code=400, detail="category and label required")
    try:
        return taxonomy_store.add_label(category, label)
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=409, detail=str(e))

@router.delete("/taxonomy/label")
def delete_label(payload: dict):
    try:
        return taxonomy_store.delete_label(payload["category"], payload["label"])
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/taxonomy/label/move")
def move_label(payload: dict):
    try:
        return taxonomy_store.move_label(
            payload["label"], payload["from_category"], payload["to_category"]
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/documents/{doc_id}/ocr")
def get_document_ocr(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc or not doc.minio_ocr_text_path:
        raise HTTPException(status_code=404, detail="OCR text not found")
    
    try:
        response = minio_client.get_object("ocr-text", doc.minio_ocr_text_path)
        return StreamingResponse(response, media_type="text/plain")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── PDF Split ─────────────────────────────────────────────────────────────────

@router.post("/split-preview")
async def split_preview(file: UploadFile = File(...)):
    """
    Upload a multi-document PDF and get suggested split points.
    Uses blank-page brightness detection (fast, no OCR).
    Stores the PDF in splits-temp bucket and returns a temp_id for split-confirm.
    """
    import io
    from pdf2image import convert_from_bytes

    ensure_buckets()
    data = await file.read()

    # Persist for later split-confirm
    temp_id = str(uuid.uuid4())
    minio_client.put_object("splits-temp", temp_id, io.BytesIO(data), length=len(data))

    # Render at 72 DPI — fast, just enough for blank detection
    images = convert_from_bytes(data, dpi=72)
    total = len(images)
    suggestions = []

    for i, img in enumerate(images):
        if i == 0:
            continue  # page 1 is never a split point
        gray = img.convert("L")
        pixels = list(gray.getdata())
        mean_brightness = sum(pixels) / len(pixels)
        # A truly blank separator page is nearly pure white AND very uniform.
        # Real document pages have lots of white margin but also text pixels,
        # giving them a non-trivial standard deviation. Only flag as blank when
        # mean > 252 (very white) AND std-dev < 8 (almost no content).
        variance = sum((p - mean_brightness) ** 2 for p in pixels) / len(pixels)
        std_dev = variance ** 0.5
        if mean_brightness > 252 and std_dev < 8:
            suggestions.append({"after_page": i, "reason": "blank", "confidence": "high"})

    return {"temp_id": temp_id, "total_pages": total, "suggestions": suggestions}


@router.post("/split-scan")
async def split_scan(payload: dict):
    """
    Scan a uploaded PDF and suggest split points based on visual similarity (CLIP).
    payload:
      temp_id: str
      sensitivity: float (0.0 to 1.0, where 1.0 is most aggressive)
    """
    from pdf2image import convert_from_bytes
    from backend.nlp.visual_splitter import get_visual_splitter
    import io

    temp_id     = payload.get("temp_id")
    sensitivity = float(payload.get("sensitivity", 0.5))

    if not temp_id:
        raise HTTPException(status_code=400, detail="temp_id required")

    try:
        resp = minio_client.get_object("splits-temp", temp_id)
        pdf_bytes = resp.read()
        resp.close(); resp.release_conn()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Temp file not found: {e}")

    # Render at low DPI for fast processing (224px target)
    # 72 DPI is enough for layout features
    images = convert_from_bytes(pdf_bytes, dpi=72)
    
    # Map sensitivity 0..1 to threshold roughly 0.70..0.95
    # Lower threshold = more similarity required (fewer splits)
    # sensitivity 1.0 -> threshold 0.95 (aggressive splitting)
    # sensitivity 0.0 -> threshold 0.70 (very conservative)
    threshold = 0.7 + (sensitivity * 0.25)

    splitter = get_visual_splitter()
    embeddings = splitter.get_page_embeddings(images)
    suggestions = splitter.suggest_splits(embeddings, threshold=threshold)

    return {"suggestions": suggestions}


@router.get("/split-thumbnail/{temp_id}/{page}")
async def split_thumbnail(temp_id: str, page: int):
    """Return a single PDF page as a JPEG thumbnail (100 DPI)."""
    import io
    from pdf2image import convert_from_bytes
    from fastapi.responses import Response

    try:
        resp = minio_client.get_object("splits-temp", temp_id)
        pdf_bytes = resp.read()
        resp.close(); resp.release_conn()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Temp file not found: {e}")

    images = convert_from_bytes(pdf_bytes, dpi=100, first_page=page, last_page=page)
    if not images:
        raise HTTPException(status_code=404, detail="Page not found")

    buf = io.BytesIO()
    images[0].save(buf, format="JPEG", quality=70)
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/jpeg")


@router.post("/split-confirm")
async def split_confirm(payload: dict, db: Session = Depends(get_db)):
    """
    payload:
      temp_id:  str
      filename: str         (original filename, used as base name for segments)
      segments: [[1,5],[6,12],...]   1-indexed, inclusive page ranges
      case_id:  str | null  (optional, assigns all segments to a case)
    """
    import io
    from pypdf import PdfReader, PdfWriter

    temp_id  = payload.get("temp_id", "")
    filename = payload.get("filename", "documento.pdf")
    segments = payload.get("segments", [])
    case_id  = payload.get("case_id")

    if not temp_id or not segments:
        raise HTTPException(status_code=400, detail="temp_id and segments required")

    # Download the temp PDF
    try:
        resp = minio_client.get_object("splits-temp", temp_id)
        pdf_bytes = resp.read()
        resp.close(); resp.release_conn()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Temp file not found: {e}")

    reader  = PdfReader(io.BytesIO(pdf_bytes))
    base    = filename.rsplit(".", 1)[0]
    results = []

    for idx, (start, end) in enumerate(segments, 1):
        writer = PdfWriter()
        for page_num in range(int(start) - 1, min(int(end), len(reader.pages))):
            writer.add_page(reader.pages[page_num])

        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        seg_bytes = buf.read()

        doc_id       = str(uuid.uuid4())
        seg_filename = f"{base}_parte{idx}.pdf"
        seg_path     = f"{doc_id}_{seg_filename}"

        try:
            minio_client.put_object("documents", seg_path, io.BytesIO(seg_bytes), length=len(seg_bytes))
            new_doc = Document(
                id=doc_id, filename=seg_filename,
                minio_pdf_path=seg_path, status=DocumentStatus.PENDING,
                case_id=case_id  # Assign case_id in constructor
            )
            db.add(new_doc)
            db.commit()
            process_document.delay(doc_id)

            if case_id:
                from backend.db.models import Case
                case = db.query(Case).filter_by(id=case_id).first()
                if case and new_doc not in case.documents:
                    case.documents.append(new_doc)
                    db.commit()

            results.append({"document_id": doc_id, "filename": seg_filename})
        except Exception as e:
            db.rollback()
            results.append({"filename": seg_filename, "error": str(e)})

    # Clean up temp
    try:
        minio_client.remove_object("splits-temp", temp_id)
    except Exception:
        pass

    return {"segments": len(segments), "results": results}
