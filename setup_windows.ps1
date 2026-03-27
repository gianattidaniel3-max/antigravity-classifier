# ECO: Script de Installazione Windows
# Questo script configura Python, Node.js e Ollama per far girare ECO senza Docker.

$ErrorActionPreference = "Stop"

# Helper: ricarica il PATH dalla registry cosi' i programmi appena installati sono trovati
function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

Write-Host "--- Avvio Configurazione ECO ---" -ForegroundColor Cyan

# 1. Verifica/Installazione Python
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python non trovato. Installazione in corso via winget..." -ForegroundColor Yellow
    winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
} else {
    Write-Host "OK Python trovato." -ForegroundColor Green
}

# 2. Verifica/Installazione Node.js
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js non trovato. Installazione in corso via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
} else {
    Write-Host "OK Node.js trovato." -ForegroundColor Green
}

# 3. Verifica/Installazione Tesseract OCR
if (!(Get-Command tesseract -ErrorAction SilentlyContinue)) {
    Write-Host "Tesseract non trovato. Installazione in corso via winget..." -ForegroundColor Yellow
    winget install UB-Mannheim.TesseractOCR --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
} else {
    Write-Host "OK Tesseract trovato." -ForegroundColor Green
}

# 4. Verifica/Installazione Poppler (necessario per pdf2image)
if (!(Get-Command pdftoppm -ErrorAction SilentlyContinue)) {
    Write-Host "Poppler non trovato. Installazione in corso via winget..." -ForegroundColor Yellow
    # Install Poppler via winget (official/stable package)
    winget install oschwartz10612.Poppler --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    
    # Check common installation path if winget doesn't add to PATH automatically
    $standardPopplerPath = "C:\Program Files\poppler\Library\bin"
    if (Test-Path $standardPopplerPath) {
        $currentPath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        if ($currentPath -notlike "*$standardPopplerPath*") {
            [System.Environment]::SetEnvironmentVariable("Path", "$currentPath;$standardPopplerPath", "Machine")
        }
    }
    Refresh-Path
    Write-Host "OK Poppler installato." -ForegroundColor Green
} else {
    Write-Host "OK Poppler trovato." -ForegroundColor Green
}

# Refresh finale per sicurezza
Refresh-Path

# 5. Configurazione Backend
Write-Host "`n--- Configurazione Backend ---" -ForegroundColor Cyan
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir
if (!(Test-Path "backend\venv")) {
    Write-Host "Creazione ambiente virtuale..."
    python -m venv backend\venv
}
Write-Host "Installazione dipendenze Python..."
& "backend\venv\Scripts\python.exe" -m pip install --upgrade pip
& "backend\venv\Scripts\python.exe" -m pip install -r backend\requirements_windows.txt
& "backend\venv\Scripts\python.exe" -m pip install uvicorn==0.27.0

# 6. Configurazione Frontend
Write-Host "`n--- Configurazione Frontend ---" -ForegroundColor Cyan
Write-Host "Installazione dipendenze Node.js..."
Set-Location "$scriptDir\frontend"
npm install
Set-Location $scriptDir

Write-Host "`nConfigurazione completata!" -ForegroundColor Green
Write-Host "Ora puoi avviare l'applicazione usando 'run_eco.bat'" -ForegroundColor Cyan
