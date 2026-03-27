@echo off
TITLE ECO - Document Classifier
echo --- Avvio di ECO in corso ---

:: Imposta directory base dello script
set "BASEDIR=%~dp0"

:: Avvio Backend in una nuova finestra (dalla directory corretta)
start "ECO Backend" cmd /k "cd /d "%BASEDIR%" && backend\venv\Scripts\python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000"

:: Aspetta che il backend parta
timeout /t 3 /nobreak >nul

:: Avvio Frontend
echo Avvio Frontend...
cd /d "%BASEDIR%frontend"
npm run dev

pause
