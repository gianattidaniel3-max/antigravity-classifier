#!/usr/bin/env bash
# ECO: Script di Installazione macOS
# Configura Python, Node.js, Tesseract e Poppler per far girare ECO senza Docker.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "--- Avvio Configurazione ECO ---"

# 1. Verifica/Installazione Homebrew
if ! command -v brew &>/dev/null; then
    echo "Homebrew non trovato. Installazione in corso..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add brew to PATH for Apple Silicon
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    echo "OK Homebrew trovato."
fi

# 2. Verifica/Installazione Python 3.11
if ! command -v python3 &>/dev/null; then
    echo "Python non trovato. Installazione in corso via Homebrew..."
    brew install python@3.11
else
    echo "OK Python trovato: $(python3 --version)"
fi

# 3. Verifica/Installazione Node.js
if ! command -v node &>/dev/null; then
    echo "Node.js non trovato. Installazione in corso via Homebrew..."
    brew install node
else
    echo "OK Node.js trovato: $(node --version)"
fi

# 4. Verifica/Installazione Tesseract OCR
if ! command -v tesseract &>/dev/null; then
    echo "Tesseract non trovato. Installazione in corso via Homebrew..."
    brew install tesseract
    brew install tesseract-lang
else
    echo "OK Tesseract trovato."
fi

# 5. Verifica/Installazione Poppler (necessario per pdf2image)
if ! command -v pdftoppm &>/dev/null; then
    echo "Poppler non trovato. Installazione in corso via Homebrew..."
    brew install poppler
else
    echo "OK Poppler trovato."
fi

# 6. Configurazione Backend
echo ""
echo "--- Configurazione Backend ---"
if [[ ! -d "backend/venv" ]]; then
    echo "Creazione ambiente virtuale..."
    python3 -m venv backend/venv
fi
echo "Installazione dipendenze Python..."
backend/venv/bin/pip install --upgrade pip
backend/venv/bin/pip install -r backend/requirements.txt
backend/venv/bin/pip install uvicorn==0.27.0

# 7. Configurazione Frontend
echo ""
echo "--- Configurazione Frontend ---"
echo "Installazione dipendenze Node.js..."
cd frontend && npm install && cd ..

echo ""
echo "Configurazione completata!"
echo "Ora puoi avviare l'applicazione usando './run_eco.sh'"
