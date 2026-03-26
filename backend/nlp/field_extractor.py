"""
Conditional field extraction based on predicted document label.
Each document type defines which fields to attempt extracting.
Schema is loaded from field_schema.json on every call — editable from the UI.

Two public entry-points:
  extract_fields()          — regex only (kept for tests / fallback)
  extract_fields_combined() — spaCy NER first, regex fills any gaps (Phase 2)
"""
import re
from typing import Dict, List, Optional
from backend.nlp.field_schema_store import load as load_schema

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

_AMOUNT_RE = re.compile(
    r'(?:€\s*|euro\s+|EUR\s+)([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)'
    r'|([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:€|euro|EUR)',
    re.IGNORECASE,
)

_SENDER_RE = re.compile(
    r'(?:mittente|da\s*:|il\s+(?:sottoscritto|sottoscritta)|per\s+conto\s+di|'
    r'lo\s+studio|studio\s+(?:legale|associato)|avv\.?|dott\.?)\s*[:\s]+'
    r'([A-ZÀÈÉÌÒÙ][^\n,]{2,60})',
    re.IGNORECASE,
)

_RECIPIENT_RE = re.compile(
    r'(?:destinatario|spett\.?(?:le)?|gentile|egregio|al\s+sig\.?|'
    r'alla\s+sig\.?ra|all[\'a]\s+(?:avv\.?|dott\.?|ing\.?|geom\.?)?|'
    r'alla\s+cortese\s+attenzione)\s*[:\s]+'
    r'([A-ZÀÈÉÌÒÙ][^\n,]{2,60})',
    re.IGNORECASE,
)

_SUBJECT_RE = re.compile(
    r'(?:oggetto|obj\.?|re\s*:)\s*[:\s]+'
    r'([^\n]{5,120})',
    re.IGNORECASE,
)

_DEADLINE_RE = re.compile(
    r'(?:entro\s+(?:il\s+|e\s+non\s+oltre\s+il\s+)?|termine\s+(?:di\s+|perentorio\s+)?|'
    r'entro\s+\d+\s+giorni|decorsi\s+\d+\s+giorni)\s*'
    r'(\d{1,2}[\s./\-]\w{2,10}[\s./\-]\d{2,4}|\d+\s+giorni)',
    re.IGNORECASE,
)

_COURT_RE = re.compile(
    r'(?:Tribunale|Corte\s+d[\'ia]|Giudice\s+di\s+Pace)\s+(?:di\s+)?'
    r'([A-ZÀÈÉÌÒÙ][a-zàèéìòùA-ZÀÈÉÌÒÙ\s]{2,30}?)(?=\s*[,\n\.]|$)',
    re.IGNORECASE,
)

_DECREE_NUM_RE = re.compile(
    r'(?:decreto\s+(?:ingiuntivo\s+)?n\.?\s*|d\.?i\.?\s*n\.?\s*)(\d+[\s/]\d+|\d+)',
    re.IGNORECASE,
)

_RG_NUM_RE = re.compile(
    r'(?:R\.?G\.?\s*n\.?\s*|n\.?\s*R\.?G\.?\s*)(\d+[\s/]\d+)',
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Individual extractors
# ---------------------------------------------------------------------------

def _extract_amount(text: str) -> Optional[str]:
    match = _AMOUNT_RE.search(text)
    if match:
        return (match.group(1) or match.group(2)).strip()
    return None


def _extract_sender(text: str) -> Optional[str]:
    match = _SENDER_RE.search(text)
    return match.group(1).strip() if match else None


def _extract_recipient(text: str) -> Optional[str]:
    match = _RECIPIENT_RE.search(text)
    return match.group(1).strip() if match else None


def _extract_subject(text: str) -> Optional[str]:
    match = _SUBJECT_RE.search(text)
    return match.group(1).strip() if match else None


def _extract_deadline(text: str) -> Optional[str]:
    match = _DEADLINE_RE.search(text)
    return match.group(1).strip() if match else None


def _extract_court(text: str) -> Optional[str]:
    match = _COURT_RE.search(text)
    return match.group(1).strip() if match else None


def _extract_decree_number(text: str) -> Optional[str]:
    match = _DECREE_NUM_RE.search(text)
    return match.group(1).strip() if match else None


def _extract_rg_number(text: str) -> Optional[str]:
    match = _RG_NUM_RE.search(text)
    return match.group(1).strip() if match else None


_EXTRACTORS = {
    "importo":         _extract_amount,
    "mittente":        _extract_sender,
    "destinatario":    _extract_recipient,
    "oggetto":         _extract_subject,
    "scadenza":        _extract_deadline,
    "tribunale":       _extract_court,
    "numero_decreto":  _extract_decree_number,
    "numero_rg":       _extract_rg_number,
}

# Fields where spaCy NER is authoritative; regex is used for everything else.
_SPACY_FIELDS = {"importo", "mittente", "destinatario", "scadenza"}

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_fields(text: str, label: str) -> Dict[str, Optional[str]]:
    """
    Regex-only extraction. Kept for tests and as the spaCy fallback.
    Schema is reloaded from field_schema.json on every call so UI edits take
    effect immediately without restarting the worker.
    """
    schema = load_schema()
    fields_to_extract = schema.get(label, [])
    result: Dict[str, Optional[str]] = {}
    for field in fields_to_extract:
        extractor = _EXTRACTORS.get(field)
        result[field] = extractor(text) if extractor else None
    return result


def extract_fields_combined(text: str, label: str) -> Dict[str, Optional[str]]:
    """
    Phase 2 extractor: Llama 3.2 (Ollama) + regex, merged.
    """
    # Step 1 — regex baseline
    result = extract_fields(text, label)

    # Step 2 — Llama overlay (Ollama)
    try:
        from backend.nlp.llama_extractor import llama_extract_fields
        llama_result = llama_extract_fields(text, label)
        for field, val in llama_result.items():
            if val is not None:
                result[field] = val
    except Exception as e:
        print(f"[field_extractor] Ollama unavailable ({type(e).__name__}: {e}) — using regex only")

    return result
