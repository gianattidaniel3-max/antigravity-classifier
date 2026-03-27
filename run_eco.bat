@echo off
SETLOCAL EnableDelayedExpansion
TITLE ECO - Instant Launch
echo ==========================================
echo       ECO DOCUMENT CLASSIFIER
echo ==========================================
echo.

set "BASEDIR=%~dp0"
cd /d "%BASEDIR%"

:: 1. Check for Virtual Environment
if not exist "backend\venv" (
    echo [!] Ambiente Python non trovato. Eseguo setup iniziale...
    powershell -ExecutionPolicy Bypass -File setup_windows.ps1
    if !errorlevel! neq 0 (
        echo [X] Errore durante il setup. Per favore esegui setup_windows.ps1 come Amministratore.
        pause
        exit /b 1
    )
)

:: 2. Check for frontend modules
if not exist "frontend\node_modules" (
    echo [*] Installazione moduli frontend in corso...
    cd frontend && npm install && cd ..
)

:: 3. Start Backend in background
echo [*] Avvio Backend (ECO Engine)...
start "ECO_BACKEND_SERVICE" /min cmd /c "cd /d "%BASEDIR%" && backend\venv\Scripts\python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000"

:: 4. Start Frontend
echo [*] Avvio Interfaccia...
echo [*] L'applicazione si aprira' automaticamente nel browser...
echo.
echo [INFO] Per chiudere ECO, chiudi questa finestra.

:: 5. Open Browser after a short delay
start "" http://localhost:5173

:: 6. Run Frontend in current window
cd frontend
npm run dev

pause
