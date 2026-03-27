"""
Async processing pipeline: PDF → OCR → LLM Vision → PostgreSQL

Phase 1 (FAST, ~3-5 s)
  OCR page 1 only → keyword classify → store temp_label/category/score
  Status set to TEMP_CLASSIFIED so the frontend can show an immediate result.

Phase 2 (LLM Vision, variable)
  All pages rendered as PNG images → sent to GPT-4o Vision with:
    - temp classification as a hint
    - page-1 OCR text as a hint
    - field schema for the detected document type
    - full taxonomy for label validation
  LLM result populates llm_* columns and becomes the authoritative
  extracted_label / extracted_fields.
  Status set to NEEDS_REVIEW.

Phase 3 (BACKGROUND full OCR)
  Remaining pages OCR'd and stored to MinIO as a .txt object.
"""
import os
import io
import time
from concurrent.futures import ThreadPoolExecutor
from celery import Celery
import redis as redis_lib
from backend.db.session import SessionLocal
from backend.db.models import Document, DocumentStatus
from backend.nlp.storage import client as minio_client

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

try:
    _redis = redis_lib.Redis.from_url(REDIS_URL, decode_responses=True)
    _redis.ping()
    celery_app = Celery(
        "file_classifier_tasks",
        broker=REDIS_URL,
        backend=REDIS_URL,
    )
except Exception:
    class DummyRedis:
        def __init__(self): 
            self.store = {}
            print("WARNING: Using Dummy Redis (Local Mode)")
        def ping(self): 
            return True
        def hset(self, key, mapping=None, **kwargs):
            if key not in self.store: self.store[key] = {}
            if mapping: self.store[key].update(mapping)
            self.store[key].update(kwargs)
            return 1
        def hgetall(self, key): return self.store.get(key, {})
        def hincrby(self, key, field, amount=1):
            if key not in self.store: self.store[key] = {}
            val = int(self.store[key].get(field, 0)) + amount
            self.store[key][field] = str(val)
            return val
        def expire(self, key, time): pass
        def hget(self, key, field): return self.store.get(key, {}).get(field)
    
    _redis = DummyRedis()
    
    class DummyCelery:
        def task(self, *args, **kwargs):
            def decorator(f):
                def delay(*args, **kwargs):
                    import threading
                    print(f"DEBUG: Running task {f.__name__} in background thread")
                    # Create a dummy 'self' that has a 'retry' method for compatibility
                    class TaskSelf:
                        def retry(self, *args, **kwargs): 
                            print(f"DEBUG: Task {f.__name__} requested retry")
                    t = threading.Thread(target=f, args=(TaskSelf(), *args), kwargs=kwargs)
                    t.daemon = True 
                    t.start()
                f.delay = delay
                return f
            return decorator
    celery_app = DummyCelery()

LOCAL_TESSDATA = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "resources", "tessdata")
)

# Pages rendered per batch in phase 3 (controls peak RAM during full OCR).
_BATCH_SIZE = 4

# DPI for vision images sent to GPT-4o.
# 150 DPI → ~1240×1754 px for A4 (well within GPT-4o 2048-px limit).
_VISION_DPI = 150


@celery_app.task(bind=True, max_retries=3)
def process_document(self, document_id: str):
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return

        doc.status = DocumentStatus.PROCESSING
        db.commit()

        from pdf2image import convert_from_bytes
        from pypdf import PdfReader
        import pytesseract
        import json as _json
        from backend.nlp.classifier import classify_legal_text
        from backend.nlp.date_extractor import extract_date

        # ── Download PDF ─────────────────────────────────────────────────────
        response  = minio_client.get_object("documents", doc.minio_pdf_path)
        pdf_bytes = response.read()
        response.close()
        response.release_conn()

        total_pages = len(PdfReader(io.BytesIO(pdf_bytes)).pages)

        tess_config = "--psm 3 --oem 1 --dpi 120"
        if os.path.exists(LOCAL_TESSDATA):
            os.environ["TESSDATA_PREFIX"] = LOCAL_TESSDATA
            tess_config += f' --tessdata-dir "{LOCAL_TESSDATA}"'

        prog_key = f"progress:{document_id}"
        _redis.hset(prog_key, mapping={
            "completed": 0,
            "total": total_pages,
            "start": time.time(),
        })
        _redis.expire(prog_key, 3600)

        # ── Helpers ───────────────────────────────────────────────────────────
        def _preprocess(image):
            from PIL import Image
            img = image.convert("L")
            if img.width > 1400:
                ratio = 1400 / img.width
                img = img.resize((1400, int(img.height * ratio)), Image.BILINEAR)
            return img

        def ocr_page(image):
            import uuid
            tmp_dir = os.path.join(
                os.path.dirname(__file__), "..", "..", "tmp"
            )
            os.makedirs(tmp_dir, exist_ok=True)
            tmp_path = os.path.join(tmp_dir, f"ocr_{uuid.uuid4()}.png")
            try:
                _preprocess(image).save(tmp_path)
                result = pytesseract.image_to_string(
                    tmp_path, lang="ita", config=tess_config
                )
                _redis.hincrby(prog_key, "completed", 1)
                return result
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

        # ═════════════════════════════════════════════════════════════════════
        # PHASE 1 — Zero-shot OCR on page 1 → temporary classification
        # ═════════════════════════════════════════════════════════════════════
        images_p1 = convert_from_bytes(
            pdf_bytes, dpi=120, first_page=1, last_page=1
        )
        page1_text = ocr_page(images_p1[0])

        prediction = classify_legal_text(page1_text)

        doc.temp_label    = prediction["label"]
        doc.temp_category = prediction["category"]
        doc.temp_score    = prediction["score"]
        doc.extracted_date = extract_date(page1_text)
        doc.status         = DocumentStatus.TEMP_CLASSIFIED
        db.commit()  # ← frontend can display temp result now

        # ═════════════════════════════════════════════════════════════════════
        # PHASE 2 — GPT-4o Vision: full document → confirmed classification
        #           + structured field extraction
        # ═════════════════════════════════════════════════════════════════════
        from backend.nlp.openai_extractor import extract_with_openai
        import backend.nlp.field_schema_store as fss
        import backend.nlp.taxonomy as tx

        # Render all pages at vision DPI (capped inside openai_extractor)
        vision_images = convert_from_bytes(
            pdf_bytes, dpi=_VISION_DPI,
            first_page=1, last_page=total_pages,
        )

        field_schema = fss.load()
        taxonomy     = tx.load()

        llm_result = extract_with_openai(
            images        = vision_images,
            temp_label    = doc.temp_label,
            temp_category = doc.temp_category,
            temp_score    = doc.temp_score,
            ocr_page1_text = page1_text,
            field_schema  = field_schema,
            taxonomy      = taxonomy,
        )

        doc.llm_label                = llm_result["label"]
        doc.llm_category             = llm_result["category"]
        doc.llm_fields               = llm_result["fields"]
        doc.llm_classification_match = llm_result["ocr_agrees"]
        doc.llm_notes                = llm_result["notes"]

        # LLM result becomes the authoritative classification
        doc.extracted_label    = llm_result["label"]
        doc.extracted_category = llm_result["category"]
        doc.extracted_fields   = llm_result["fields"]
        # Confidence: map LLM string to float for UI consistency
        _conf_map = {"high": 0.95, "medium": 0.75, "low": 0.50}
        doc.confidence_score = _conf_map.get(llm_result["confidence"], 0.50)

        doc.status = DocumentStatus.NEEDS_REVIEW
        db.commit()  # ← authoritative result available to frontend

        # ═════════════════════════════════════════════════════════════════════
        # PHASE 3 — Full OCR remaining pages → store to MinIO
        # ═════════════════════════════════════════════════════════════════════
        all_texts = [page1_text] + [None] * (total_pages - 1)

        if total_pages > 1:
            for batch_start in range(2, total_pages + 1, _BATCH_SIZE):
                batch_end  = min(batch_start + _BATCH_SIZE - 1, total_pages)
                batch_imgs = convert_from_bytes(
                    pdf_bytes, dpi=120,
                    first_page=batch_start, last_page=batch_end,
                )
                with ThreadPoolExecutor(max_workers=1) as ex:
                    batch_texts = list(ex.map(ocr_page, batch_imgs))
                for j, t in enumerate(batch_texts):
                    all_texts[batch_start - 1 + j] = t

        full_ocr  = "".join(
            f"\n[Pagina {i+1}]\n{t}" for i, t in enumerate(all_texts)
        )
        ocr_path  = doc.minio_pdf_path.replace(".pdf", ".txt")
        ocr_bytes = full_ocr.encode("utf-8")
        minio_client.put_object(
            "ocr-text", ocr_path,
            io.BytesIO(ocr_bytes), length=len(ocr_bytes),
        )
        doc.minio_ocr_text_path = ocr_path
        db.commit()

    except Exception as e:
        print(f"Error processing {document_id}: {e}")
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = DocumentStatus.FAILED
            db.commit()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()
