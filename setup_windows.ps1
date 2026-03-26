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

# 3. Verifica/Installazione Ollama
if (!(Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "Ollama non trovato. Installazione in corso via winget..." -ForegroundColor Yellow
    winget install ollama.ollama --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
} else {
    Write-Host "OK Ollama trovato." -ForegroundColor Green
}

# Refresh finale per sicurezza
Refresh-Path

# 4. Configurazione Backend
Write-Host "`n--- Configurazione Backend ---" -ForegroundColor Cyan
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir
if (!(Test-Path "backend\venv")) {
    Write-Host "Creazione ambiente virtuale..."
    python -m venv backend\venv
}
Write-Host "Installazione dipendenze Python..."
& "backend\venv\Scripts\python.exe" -m pip install -r backend\requirements.txt

# 5. Configurazione Frontend
Write-Host "`n--- Configurazione Frontend ---" -ForegroundColor Cyan
Write-Host "Installazione dipendenze Node.js..."
Set-Location "$scriptDir\frontend"
npm install
Set-Location $scriptDir

# 6. Scaricamento Modello AI
Write-Host "`n--- Configurazione AI ---" -ForegroundColor Cyan
ollama pull llama3.2:3b

Write-Host "`nConfigurazione completata!" -ForegroundColor Green
Write-Host "Ora puoi avviare l'applicazione usando 'run_eco.bat'" -ForegroundColor Cyan
