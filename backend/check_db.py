from backend.db.session import SessionLocal
from backend.db.models import Document

def check_docs():
    db = SessionLocal()
    docs = db.query(Document).all()
    for doc in docs:
        print(f"ID: {doc.id}, Filename: {doc.filename}, Status: {doc.status}, Label: {doc.extracted_label}")
    db.close()

if __name__ == "__main__":
    check_docs()
