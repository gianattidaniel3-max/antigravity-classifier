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
$popplerPath = "C:\Program Files\poppler\Library\bin"
if (!(Test-Path $popplerPath)) {
    Write-Host "Poppler non trovato. Download in corso..." -ForegroundColor Yellow
    $popplerUrl = "https://github.com/oschwartz10612/poppler-windows/releases/download/v24.02.0-0/Release-24.02.0-0.zip"
    $popplerZip = "$env:TEMP\poppler.zip"
    $popplerDest = "C:\Program Files\poppler"
    Invoke-WebRequest -Uri $popplerUrl -OutFile $popplerZip
    Expand-Archive -Path $popplerZip -DestinationPath $popplerDest -Force
    Remove-Item $popplerZip
    # Add to system PATH
    $currentPath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    if ($currentPath -notlike "*$popplerPath*") {
        [System.Environment]::SetEnvironmentVariable("Path", "$currentPath;$popplerPath", "Machine")
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

# 6. Configurazione Frontend
Write-Host "`n--- Configurazione Frontend ---" -ForegroundColor Cyan
Write-Host "Installazione dipendenze Node.js..."
Set-Location "$scriptDir\frontend"
npm install
Set-Location $scriptDir

Write-Host "`nConfigurazione completata!" -ForegroundColor Green
Write-Host "Ora puoi avviare l'applicazione usando 'run_eco.bat'" -ForegroundColor Cyan
