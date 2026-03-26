# Antigravity Classifier — Product Roadmap

---

## Phase 0 — Prototype (Current) ✅
- PDF upload and storage (MinIO)
- OCR with Tesseract (Italian, parallel pages)
- Date extraction via regex
- Zero-shot document classification (mDeBERTa, Italian-Legal-BERT)
- Human-in-the-Loop (HITL) verification panel
- SSE real-time progress updates
- Batch upload (folder of documents)
- Conditional field extraction by document type
- Collapsible OCR panel, memoized PDF viewer

---

## Phase 1 — Trained Classifier (Due Tuesday 2026-03-24)
- BERT embeddings + sklearn LogisticRegression classifier
- Training script reads all human-verified documents from DB
- Nightly retraining via Celery beat (2am)
- Fallback chain: sklearn → zero-shot if confidence < 0.75
- Every HITL correction directly improves next day's predictions

---

## Phase 2 — Field Extraction Upgrade
- Replace regex with spaCy NER (Italian model) for richer extraction
- Extract: parties, amounts, deadlines, case numbers, court names
- Conditional schema: different fields per document type
- User can manually correct any extracted field in the UI

---

## Phase 3 — Authentication & Multi-User
- Login page (email + password, or Google/Microsoft SSO)
- JWT token authentication on all API endpoints
- Users table: each document linked to a user
- Role system: reviewer / admin
- Optional: 2FA

---

## Phase 4 — Export & Reporting
- Per-document export: PDF or DOCX summary sheet
- Batch export: CSV/Excel of verified documents by date range
- Stats dashboard: documents processed, accuracy rate, document type distribution
- Audit trail: who verified what, when, and what corrections were made

---

## Phase 5 — Distribution (Local Deployment)

### Model: each user runs the system on their own machine

**Architecture decision:** Local deployment, not a shared server.
- Zero server costs
- Zero privacy risk — data never leaves the user's machine
- Works fully offline after first setup
- Ideal for law firms: each firm's data stays entirely theirs

**What gets distributed:**
- Docker Compose bundle (PostgreSQL, Redis, MinIO pre-configured)
- Python backend + built React frontend
- AI models pre-downloaded (~1GB, no internet needed after install)
- One-click startup script (`start.sh` / `start.bat` for Windows)

**User experience target:** Double-click → browser opens → system running.

**Work required:**
- Pre-bundle AI models into the distribution package
- Write cross-platform startup scripts (Mac + Windows)
- Test on a clean machine with no prior setup
- Optional: wrap in Electron for a native app feel

**For larger firms (later):** Option B — one server per firm, shared internally over LAN, with authentication from Phase 3.

---

## Phase 6 — Production Hardening (for Option B / shared server)
- nginx reverse proxy (routes `/api/` → FastAPI, `/` → static React build)
- HTTPS / SSL certificate (Let's Encrypt or self-signed for internal use)
- Gunicorn + Uvicorn workers (replace dev server)
- systemd process management (auto-restart on reboot)
- Automated daily database and storage backups

---

## Deferred / Under Evaluation
- Gmail OAuth integration (read incoming legal correspondence)
- Windows native installer (NSIS or Inno Setup)
- Mobile-responsive UI

---

*Last updated: 2026-03-22*
