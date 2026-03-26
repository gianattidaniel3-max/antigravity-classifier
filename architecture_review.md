# Architecture Review: Devil's Advocate Critique

**Thesis (Steelmanned):**
The `file_classifier` architecture relies on a local pipeline using `ITALIAN-LEGAL-BERT`, falling back to `Tint/SmartPA` for token extraction, and a Secure Cloud API for low confidence items. It uses an asynchronous Celery + Redis queue to handle 30 documents/hour (900 pages), storing metadata in PostgreSQL, with a React UI enabling Human-in-the-Loop active learning. This maximizes data privacy while ensuring scalability and continuous precision improvement.

## 🔴 Failure Modes (Pre-mortem Analysis)

### 1. The Database Bloat & Text Overload
- **The Vulnerability:** OCRing 900 pages/hour generates massive unstructured text. Storing full text for every document version, along with correction logs, tokens, and active learning metadata in PostgreSQL will rapidly bloat the database.
- **Consequence Chain:** DB performance degrades -> Backup times explode -> Active learning queries slow down -> the React UI becomes sluggish during verification.

### 2. The Annotation Trap (HITL Bottleneck)
- **The Vulnerability:** 30 documents/hour = 1 document every 2 minutes. If the local BERT model initially has a low confidence rate, humans must verify numerous documents rapidly. If the React UI isn't ergonomically perfect (e.g., keyboard shortcuts, direct text highlighting), users will fatigue and mass-approve without checking.
- **Consequence Chain:** Users mass-approve -> Fake/wrong ground-truth enters the DB -> The automated fine-tuning loop trains on lazy human mistakes -> Model accuracy permanently degrades.

### 3. The Cloud Fallback Legal/Learning Disconnect
- **The Vulnerability:** When the local model has <85% confidence, it sends data to a secure Cloud API (e.g., Azure OpenAI). If the user approves the Cloud API's correct guess, that data goes into the fine-tuning queue for the *local* BERT model. Major LLM providers explicitly prohibit using their model outputs to train competing models.
- **Consequence Chain:** Legal violation of Cloud Terms of Service -> OR we must discard Cloud-assisted data -> The local model never learns from its weakest areas and is forever dependent on the Cloud.

## 🟢 Synthesized Mitigations & Solutions

### 1. Hybrid Storage Architecture (Fixing DB Bloat)
**Solution:** Adopt a separated storage model. Use **MinIO** (an open-source S3-compatible object store) to store the physical PDFs and the massive raw OCR text files. PostgreSQL will only store lightweight relational metadata (Document ID, Extracted Date, Label, Verification Status, and MinIO URLs). When the active learning pipeline runs, the ML workers stream the raw text directly from MinIO using the references in Postgres.

### 2. Ergonomics & Trust Heuristics (Fixing the Annotation Trap)
**Solution:** The React UI must be keyboard-driven (e.g., `Arrow Keys` to navigate, `Enter` to approve). More importantly, the backend must implement a **"Time-to-Approve" heuristic**. If a user approves a 30-page document extraction in under 2 seconds, the system accepts the workflow to unblock the user, but silently tags the data as `verification: suspicious`. Suspicious data is explicitly filtered out of the Active Learning training set to prevent model poisoning.

### 3. Data Provenance Firewall (Fixing Cloud Training Disconnect)
**Solution:** We must completely isolate Cloud API outputs from our training pipeline to comply with AI provider Terms of Service. In PostgreSQL, every extraction will have a `provenance` tag (`local_bert`, `cloud_api`, or `human_manual`). The active learning module's SQL query will strictly filter `WHERE provenance != 'cloud_api'`. The local model will *only* be fine-tuned on documents where a human manually typed or selected the correct answer without Cloud assistance.

**Confidence Assessment:** HIGH. With these specific constraints added to the architecture, the system is highly resilient and compliant.
