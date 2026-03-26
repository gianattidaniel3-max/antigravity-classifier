from backend.db.session import SessionLocal
from backend.db.models import Document, DocumentStatus

def reset_stuck_docs():
    db = SessionLocal()
    stuck_docs = db.query(Document).filter(Document.status == DocumentStatus.PROCESSING).all()
    print(f"Found {len(stuck_docs)} stuck documents.")
    for doc in stuck_docs:
        doc.status = DocumentStatus.PENDING
        print(f"Reset {doc.id} to PENDING")
    db.commit()
    db.close()

if __name__ == "__main__":
    reset_stuck_docs()
