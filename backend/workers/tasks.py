import os
import io
import time
from typing import List, Optional
from celery import Celery
from sqlalchemy.orm import Session
from backend.db.session import SessionLocal
from backend.db.models import Document, DocumentStatus
from backend.nlp.storage import client as minio_client
from pdf2image import convert_from_bytes
from pypdf import PdfReader
from concurrent.futures import ThreadPoolExecutor

celery_app = Celery("document_worker", broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"))

# ── Redis Fallback / Local Mode ─────────────────────────────────────────────
import redis as redis_lib
try:
    _r = redis_lib.Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    _r.ping()
    print("Celery: Using Redis broker.")
except Exception:
    print("Celery: Redis not reachable. Switching to Synchronous LOCAL MODE (eager).")
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True

# Constants for Vision processing
_VISION_DPI = 150

# ── Poppler detection ────────────────────────────────────────────────────────
import shutil
_P_PATH = os.getenv("POPPLER_PATH") or shutil.which("pdfinfo")
_POPPLER_PATH = None
if _P_PATH:
    _POPPLER_PATH = os.path.dirname(_P_PATH)
else:
    _P_CANDS = [
        r"C:\Program Files\poppler\Library\bin",
        r"C:\Program Files\poppler\bin",
        "/opt/homebrew/bin",
        "/usr/local/bin"
    ]
    for _p in _P_CANDS:
        if os.path.exists(os.path.join(_p, "pdfinfo.exe" if os.name=="nt" else "pdfinfo")):
            _POPPLER_PATH = _p; break

@celery_app.task(bind=True, max_retries=3)
def process_document(self, document_id: str):
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc: return

        doc.status = DocumentStatus.PROCESSING
        db.commit()

        import json as _json
        from backend.nlp.openai_extractor import extract_with_openai
        from openai import OpenAI

        # ── Step 1: Download PDF ──────────────────────────────────────────────
        response  = minio_client.get_object("documents", doc.minio_pdf_path)
        pdf_bytes = response.read()
        response.close(); response.release_conn()

        reader = PdfReader(io.BytesIO(pdf_bytes))
        total_pages = len(reader.pages)

        # ── Step 2: Preliminary Vision Analysis (Page 1) ──────────────────────
        images_p1 = convert_from_bytes(
            pdf_bytes, dpi=_VISION_DPI, first_page=1, last_page=1,
            poppler_path=_POPPLER_PATH,
        )
        if not images_p1:
            raise Exception("Impossibile convertire il PDF in immagini.")
            
        img_p1 = images_p1[0]
        
        # Convert to base64 for Vision API
        import base64
        buffered = io.BytesIO()
        img_p1.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()

        # Hardcoded for Microsoft User Version
        api_key = (
            "sk-proj-twOpqaWCC4BlwsoHV0ftI-DAZLka2SSOJ"
            "FNcXRRs8n1Y3my8UeB4en9i6l8WzrDF40gKvpfKZa"
            "T3BlbkFJnuSEQ6j9PH1LdhgB6skT0ruHETS1Otkq-"
            "YlKQY9EnGSS47tJFY1FRkS7z0KitsNUPHfklV_jMA"
        )
        client = OpenAI(api_key=api_key)
        
        prompt = """
        Analizza questo documento legale/bancario italiano (Pagina 1) e restituisci un JSON:
        {
           "ocr_text": "un breve riassunto testuale (max 500 caratteri)",
           "label": "Tipo documento (es. Decreto Ingiuntivo, Fattura, etc.)",
           "category": "Categoria (es. Giustizia Civile, Fiscale)",
           "extracted_date": "Data rilevante (format DD/MM/YYYY)"
        }
        """
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_str}"}}
            ]}],
            response_format={"type": "json_object"}
        )
        
        prediction = _json.loads(response.choices[0].message.content)
        page1_text = prediction.get("ocr_text", "")

        doc.temp_label     = prediction.get("label", "Sconosciuto")
        doc.temp_category  = prediction.get("category", "Generale")
        doc.temp_score     = 0.95
        doc.extracted_date = prediction.get("extracted_date")
        doc.status          = DocumentStatus.TEMP_CLASSIFIED
        db.commit()

        # ── Step 3: Deep Field Extraction (Full Vision Analysis) ───────────────
        import backend.nlp.field_schema_store as fss
        import backend.nlp.taxonomy as tx

        # Load dynamic configurations
        field_schema = fss.load()
        taxonomy     = tx.load()

        # Render relevant pages for deep analysis (often just the first N)
        vision_images = convert_from_bytes(
            pdf_bytes, dpi=_VISION_DPI,
            first_page=1, last_page=min(total_pages, 5), # Limit to first 5 for speed/cost
            poppler_path=_POPPLER_PATH,
        )

        llm_result = extract_with_openai(
            images         = vision_images,
            temp_label     = doc.temp_label,
            temp_category  = doc.temp_category,
            temp_score     = 0.95,
            ocr_page1_text = page1_text,
            field_schema   = field_schema,
            taxonomy       = taxonomy,
        )

        # Map results to authoritative fields
        doc.extracted_label    = llm_result["label"]
        doc.extracted_category = llm_result["category"]
        doc.extracted_fields   = llm_result["fields"]
        doc.llm_notes          = llm_result["notes"]
        
        _conf_map = {"high": 0.95, "medium": 0.75, "low": 0.50}
        doc.confidence_score = _conf_map.get(llm_result["confidence"], 0.50)

        # Status: Success
        doc.status = DocumentStatus.NEEDS_REVIEW
        db.commit()

    except Exception as e:
        import traceback
        print(f"FAILED {document_id}: {str(e)}\n{traceback.format_exc()}")
        try:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc and doc.status != DocumentStatus.NEEDS_REVIEW:
                doc.status = DocumentStatus.FAILED
                doc.llm_notes = f"Errore: {str(e)[:400]}"
                db.commit()
        except: pass
    finally:
        db.close()
