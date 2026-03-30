# ECO — Document Classifier

Classifica automaticamente documenti legali italiani tramite OCR + GPT-4o Vision.

## Requisiti

- Windows 10/11 (o macOS)
- OpenAI API key (`sk-...`)

## Installazione (Windows)

1. Scarica il repository come ZIP oppure clona:
   ```
   git clone https://github.com/gianattidaniel3-max/eco-document-classifier.git
   ```
2. Apri la cartella scaricata
3. Tasto destro su `setup_windows.ps1` → **Esegui con PowerShell (come Amministratore)**
   - Installa automaticamente: Python 3.11, Node.js, Tesseract OCR, Poppler, tutte le dipendenze

## Avvio (Windows)

Doppio click su **`run_eco.bat`**

Il browser si apre automaticamente su `http://localhost:5173`

## Configurazione API Key

1. Clicca l'icona ⚙️ Impostazioni nell'interfaccia
2. Incolla la tua OpenAI API key
3. Salva → puoi iniziare a caricare documenti

## Installazione (macOS)

```bash
bash setup_mac.sh
bash run_eco.sh
```

## Pipeline di processamento

| Fase | Operazione | Stato |
|------|-----------|-------|
| 1 | OCR pagina 1 → classificazione keyword | `TEMP_CLASSIFIED` |
| 2 | GPT-4o Vision → estrazione campi strutturati | `NEEDS_REVIEW` |
| 3 | OCR pagine rimanenti → archivio testo | — |

## Struttura

```
backend/    FastAPI + SQLite + pipeline OCR/LLM
frontend/   React (Vite)
run_eco.bat     Avvio Windows
run_eco.sh      Avvio macOS
setup_windows.ps1
setup_mac.sh
```
