from backend.db.session import SessionLocal
from backend.db.models import Document, DocumentStatus
from backend.workers.tasks import process_document

def re_enqueue_stuck_docs():
    db = SessionLocal()
    stuck_docs = db.query(Document).filter(Document.status == DocumentStatus.PENDING).all()
    print(f"Found {len(stuck_docs)} pending documents to re-enqueue.")
    for doc in stuck_docs:
        print(f"Enqueuing {doc.id} ({doc.filename})...")
        process_document.delay(doc.id)
    db.close()
    print("All tasks enqueued.")

if __name__ == "__main__":
    re_enqueue_stuck_docs()
