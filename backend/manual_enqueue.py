from backend.workers.tasks import process_document
import sys

if __name__ == "__main__":
    if len(sys.argv) > 1:
        doc_id = sys.argv[1]
        print(f"Manually enqueueing task for: {doc_id}")
        result = process_document.delay(doc_id)
        print(f"Task ID: {result.id}")
    else:
        print("Usage: python3 manual_enqueue.py <doc_id>")
