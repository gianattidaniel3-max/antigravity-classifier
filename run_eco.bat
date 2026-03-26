@echo off
TITLE ECO - Document Classifier
echo --- Avvio di ECO in corso ---

:: Avvio Backend in una nuova finestra
start "ECO Backend" cmd /k "backend\venv\Scripts\python -m uvicorn backend.api.main:app --reload --port 8000"

:: Avvio Frontend nella finestra corrente
echo Avvio Frontend...
cd frontend
npm run dev

pause
