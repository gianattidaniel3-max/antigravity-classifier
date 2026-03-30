#!/usr/bin/env bash
# ECO - Instant Launch (macOS)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "      ECO DOCUMENT CLASSIFIER"
echo "=========================================="
echo ""

# 1. Check for Virtual Environment
if [[ ! -d "backend/venv" ]]; then
    echo "[!] Ambiente Python non trovato. Eseguo setup iniziale..."
    bash setup_mac.sh
fi

# 2. Check for frontend modules
if [[ ! -d "frontend/node_modules" ]]; then
    echo "[*] Installazione moduli frontend in corso..."
    cd frontend && npm install && cd ..
fi

# 3. Start Backend in background
echo "[*] Avvio Backend (ECO Engine)..."
backend/venv/bin/python -m uvicorn backend.api.main:app \
    --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# 4. Start Celery worker in background (export API key so forked workers inherit it)
echo "[*] Avvio Celery Worker..."
export OPENAI_API_KEY=$(grep ^OPENAI_API_KEY "$SCRIPT_DIR/backend/.env" | cut -d= -f2-)
backend/venv/bin/celery -A backend.workers.tasks worker \
    --loglevel=warning --concurrency=2 &> /tmp/eco_celery.log &
CELERY_PID=$!

# 5. Open browser after a short delay
echo "[*] Avvio Interfaccia..."
echo "[*] L'applicazione si aprira' automaticamente nel browser..."
echo ""
echo "[INFO] Per chiudere ECO, premi Ctrl+C in questa finestra."
(sleep 3 && open http://localhost:5173) &

# 6. Run Frontend (blocks until Ctrl+C)
cd frontend
npm run dev

# Cleanup on exit
kill "$BACKEND_PID" 2>/dev/null || true
kill "$CELERY_PID" 2>/dev/null || true
