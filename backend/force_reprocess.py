from backend.db.session import SessionLocal
from backend.db.models import Document, DocumentStatus
from backend.workers.tasks import process_document

def force_reprocess():
    db = SessionLocal()
    docs = db.query(Document).filter(Document.status != DocumentStatus.VERIFIED).all()
    print(f"Forcing re-processing of {len(docs)} documents.")
    for doc in docs:
        doc.status = DocumentStatus.PENDING
        doc.extracted_label = None # Clear errors
        doc.confidence_score = None
        db.commit()
        print(f"Enqueuing {doc.id}...")
        process_document.delay(doc.id)
    db.close()
    print("All tasks enqueued.")

if __name__ == "__main__":
    force_reprocess()
