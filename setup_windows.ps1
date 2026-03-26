# ECO: Script de Installazione Windows 🚀
# Questo script configura Python, Node.js e Ollama per far girare ECO senza Docker.

$ErrorActionPreference = "Stop"

Write-Host "--- Avvio Configurazione ECO ---" -ForegroundColor Cyan

# 1. Verifica/Installazione Python
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python non trovato. Installazione in corso via winget..." -ForegroundColor Yellow
    winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
} else {
    Write-Host "✅ Python trovato." -ForegroundColor Green
}

# 2. Verifica/Installazione Node.js
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js non trovato. Installazione in corso via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements
} else {
    Write-Host "✅ Node.js trovato." -ForegroundColor Green
}

# 3. Verifica/Installazione Ollama
if (!(Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "Ollama non trovato. Installazione in corso via winget..." -ForegroundColor Yellow
    winget install ollama.ollama --silent --accept-package-agreements --accept-source-agreements
} else {
    Write-Host "✅ Ollama trovato." -ForegroundColor Green
}

# 4. Configurazione Backend
Write-Host "`n--- Configurazione Backend ---" -ForegroundColor Cyan
Set-Location "backend"
if (!(Test-Path "venv")) {
    Write-Host "Creazione ambiente virtuale..."
    python -m venv venv
}
Write-Host "Installazione dipendenze Python..."
.\venv\Scripts\python -m pip install -r requirements.txt
Set-Location ".."

# 5. Configurazione Frontend
Write-Host "`n--- Configurazione Frontend ---" -ForegroundColor Cyan
Set-Location "frontend"
Write-Host "Installazione dipendenze Node.js..."
npm install
Set-Location ".."

# 6. Scaricamento Modello AI
Write-Host "`n--- Configurazione AI ---" -ForegroundColor Cyan
ollama pull llama3.2:3b

Write-Host "`n✨ Configurazione completata! ✨" -ForegroundColor Green
Write-Host "Ora puoi avviare l'applicazione usando 'run_eco.bat'" -ForegroundColor Cyan
