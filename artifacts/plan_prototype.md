# Prototype Roadmap: file_classifier (2-Day Sprint)

**Objective:** Build a functional, end-to-end prototype capable of ingesting an Italian legal document, performing heavy OCR asynchronously, classifying it via BERT, and allowing a human to verify it via a React UI.

## Day 1: Foundation & Intelligence
**Focus:** Infrastructure, Data Flow, and the NLP Worker.

1. **Morning: The Scaffold**
   - Create `docker-compose.yml` to spin up PostgreSQL (Metadata), Redis (Task Queue), and MinIO (Raw Text/PDF Object Storage).
   - Initialize the `FastAPI` application structure.
   - Define the database schema (Tables: `Documents`, `Verifications`).

2. **Afternoon: The Heavy Lifters**
   - Implement the `Celery` worker queue to handle long-running document processing.
   - Integrate `pytesseract` to extract raw text from uploaded PDFs/Scans, saving output to MinIO.
   - Integrate `transformers` to load `dlicari/Italian-Legal-BERT` to predict the document label based on the OCR text.

## Day 2: The Interface & The Loop
**Focus:** Human-in-the-Loop frontend and End-to-End wiring.

3. **Morning: The React Dashboard**
   - Scaffold a fast React + TypeScript interface using Vite.
   - Build the Split-Screen Validation UI: PDF viewer on the left, an editable Form (Extracted Date, Label) on the right.
   - Build a real-time progress indicator using Server-Sent Events (SSE) so the UI doesn't time out while Celery processes the heavy OCR.

4. **Afternoon: The Feedback Mechanism**
   - Implement the FastAPI `POST /verify` endpoint.
   - Add the Trust Heuristic: If verification time < 2 seconds, flag the DB entry as `suspicious`.
   - Run a full End-to-End functional test using a sample Italian legal PDF to ensure the metadata flows correctly from upload -> OCR -> BERT -> React UI -> Postgres correction log.
