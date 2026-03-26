"""
Field extractor using Llama 3.2:3b via Ollama (local, free, offline).

Replaces regex patterns with LLM contextual understanding.
Falls back to regex if Ollama is unavailable or times out.

Ollama must be running: `brew services start ollama`
Model: llama3.2:3b (2GB, already downloaded)
"""
import json
import requests
from typing import Dict, Optional

from backend.nlp.field_schema_store import load as load_schema
from backend.nlp.field_extractor import extract_fields as regex_fallback

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_TIMEOUT = 45  # seconds — 3B model on CPU takes up to ~15s, Metal GPU ~5s
MODEL = "llama3.2:3b"

# Human-readable descriptions used in the Italian prompt
_FIELD_DESC: Dict[str, str] = {
    "importo":        "importo o somma di denaro (es. 15.000,00 €)",
    "mittente":       "nome completo di chi ha inviato il documento (persona o azienda)",
    "destinatario":   "nome completo di chi ha ricevuto il documento (persona o azienda)",
    "oggetto":        "oggetto o argomento principale del documento",
    "scadenza":       "data di scadenza o termine ultimo indicato nel documento",
    "tribunale":      "nome del tribunale o della corte competente",
    "numero_decreto": "numero del decreto ingiuntivo",
    "numero_rg":      "numero di registro generale (R.G.) del procedimento",
}


def llama_extract_fields(text: str, label: str) -> Dict[str, Optional[str]]:
    """
    Ask Llama 3.2:3b to extract structured fields from OCR text.

    1. Loads which fields to extract from field_schema.json (same source as regex).
    2. Builds an Italian prompt describing the task and fields.
    3. Calls Ollama with format='json' for deterministic structured output.
    4. On any failure (timeout, parse error, Ollama down), falls back to regex.
    """
    schema = load_schema()
    fields_to_extract = schema.get(label, [])

    if not fields_to_extract:
        return {}

    # Build field list for the prompt
    field_lines = "\n".join(
        f'- "{f}": {_FIELD_DESC.get(f, f)}' for f in fields_to_extract
    )

    # First 1000 chars contain document header — that's where all key fields appear
    excerpt = text[:1000].strip()

    prompt = (
        f'Sei un assistente legale italiano esperto. '
        f'Il seguente testo è estratto da un documento legale classificato come "{label}".\n\n'
        f'Estrai ESATTAMENTE i seguenti campi e restituisci SOLO un oggetto JSON valido, '
        f'senza testo aggiuntivo o spiegazioni. '
        f'Se un campo non è presente nel testo, usa null.\n\n'
        f'Campi da estrarre:\n{field_lines}\n\n'
        f'Testo del documento:\n"""\n{excerpt}\n"""'
    )

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "format": "json",
                "stream": False,
                "keep_alive": 0,          # unload model from RAM immediately after response
                "options": {
                    "temperature": 0.05,   # near-deterministic for extraction tasks
                    "num_predict": 256,    # field values are short — cap tokens for speed
                },
            },
            timeout=OLLAMA_TIMEOUT,
        )
        response.raise_for_status()

        raw = response.json()["message"]["content"].strip()
        parsed = json.loads(raw)

        # Normalise: only keep expected fields, convert empty / "null" strings to None
        result: Dict[str, Optional[str]] = {}
        for field in fields_to_extract:
            val = parsed.get(field)
            if val is None or str(val).strip().lower() in ("", "null", "none", "n/a", "nd"):
                result[field] = None
            else:
                result[field] = str(val).strip()

        return result

    except requests.exceptions.Timeout:
        print(f"[llama_extractor] Timeout after {OLLAMA_TIMEOUT}s — using regex fallback")
        return regex_fallback(text, label)
    except Exception as e:
        print(f"[llama_extractor] Failed ({type(e).__name__}: {e}) — using regex fallback")
        return regex_fallback(text, label)
