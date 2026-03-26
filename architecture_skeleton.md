# Architecture Skeleton: file_classifier

## 1. Executive Summary
An asynchronous, privacy-first document processing pipeline designed to OCR, classify, and extract metadata from Italian legal documents at a rate of ~900 pages/hour. It uses local open-source Italian NLP models with a Human-in-the-Loop Web UI for active learning.

## 2. Component Domains
- **Ingestion & Task Routing:** Asynchronously accepts documents and queues them for Heavy OCR and ML processing to avoid blocking the Web UI.
- **NLP Intelligence:** Executes `ITALIAN-LEGAL-BERT` for classification and `Tint`/`SmartPA` for metadata/date extraction. Features a secure Cloud API fallback for low-confidence scores.
- **HITL Web UI:** A fast, Microsoft-browser compatible interface where users view the original PDF and the extracted text side-by-side to perform instant verifications.
- **Active Learning Loop:** Securely persists human corrections and schedules periodic fine-tuning of the local classification head.

## 3. Tech Stack
- **Frontend UI:** React + TypeScript (Fast, reliable, Enterprise/Microsoft compatible).
- **Backend API:** FastAPI (Python) - Optimal for bridging the ML ecosystem with the frontend.
- **Task Queue:** Celery + Redis - **Mandatory** for handling the OCR/NLP load of 30 large documents (~900 pages) per hour without timeouts.
- **Database:** PostgreSQL - Robust, local relational storage for document metadata, correction logs, and audit trails.
- **ML & OCR:** Tesseract (OCR), ITALIAN-LEGAL-BERT, Tint (FBK).

## 4. Folder Structure
```text
/Projects/file_classifier
├── /frontend           # React/TypeScript UI
├── /backend
│   ├── /api            # FastAPI routes & business logic
│   ├── /nlp            # ML model wrappers & Cloud API fallback logic
│   ├── /workers        # Celery tasks (OCR & Inference)
│   └── /db             # PostgreSQL models & migrations
├── /models             # Local weights & active learning checkpoints
└── /docs               # Specs and Architecture
```

## 5. Required Antigravity Skills for Next Phase
- `fastapi-pro` (Backend API & Auth)
- `react-best-practices` (Frontend UI)
- `mlops-engineer` (Active Learning Pipeline & Celery Workers)
- `c4-architecture` (For detailed system diagramming)
