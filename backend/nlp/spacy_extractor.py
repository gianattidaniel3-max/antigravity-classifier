"""
spaCy NER-based field extractor using the Italian model it_core_news_lg.

Handles the 4 fields where entity recognition beats regex:
  - importo      (MONEY entities)
  - mittente     (PER/ORG near sender-indicator tokens)
  - destinatario (PER/ORG near recipient-indicator tokens)
  - scadenza     (DATE near deadline-indicator tokens)

For tribunale, numero_decreto, numero_rg, oggetto the regex patterns in
field_extractor.py remain authoritative — structured patterns outperform
general NER for those fields.

Setup (one-time):
    pip install spacy
    python -m spacy download it_core_news_lg
"""
import re
from typing import Dict, Optional

# ---------------------------------------------------------------------------
# Singleton model — loaded once per worker process (~560 MB, ~2 s cold start)
# ---------------------------------------------------------------------------

_nlp = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy  # noqa: import deferred so the module loads without spaCy installed
        _nlp = spacy.load("it_core_news_lg")
    return _nlp


# ---------------------------------------------------------------------------
# Role-indicator vocabulary
# ---------------------------------------------------------------------------

# Lowercase tokens/phrases that signal the nearby entity is the *sender*
_SENDER_INDICATORS = {
    "mittente", "da:", "da :", "il sottoscritto", "la sottoscritta",
    "per conto di", "lo studio", "studio legale", "studio associato",
    "avv.", "avv", "dott.", "dott", "ing.", "geom.",
}

# Lowercase tokens/phrases that signal the nearby entity is the *recipient*
_RECIPIENT_INDICATORS = {
    "destinatario", "spett.", "spett", "spettabile",
    "gentile", "egregio", "al sig.", "alla sig.", "al sig",
    "alla cortese attenzione", "c.a.", "c/a",
}

# Regex for deadline-context words (must precede a DATE entity)
_DEADLINE_CTX = re.compile(
    r'\b(entro|termine|perentorio|non oltre|decorsi|entro e non oltre)\b',
    re.IGNORECASE,
)

# How many characters before an entity to scan for context indicators
_CONTEXT_WINDOW_CHARS = 80


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _text_before(doc_text: str, ent_start_char: int) -> str:
    start = max(0, ent_start_char - _CONTEXT_WINDOW_CHARS)
    return doc_text[start:ent_start_char].lower()


def _find_role_entity(doc, indicators: set) -> Optional[str]:
    """
    Return the text of the first PER or ORG entity whose preceding context
    contains one of the indicator phrases.
    """
    doc_text = doc.text
    for ent in doc.ents:
        if ent.label_ not in ("PER", "ORG"):
            continue
        context = _text_before(doc_text, ent.start_char)
        if any(ind in context for ind in indicators):
            return ent.text.strip()
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def spacy_extract(text: str) -> Dict[str, Optional[str]]:
    """
    Run spaCy NER on the first 1 500 characters of OCR text and return
    extracted values for the 4 NER-suitable fields.

    Missing or undetected fields are returned as None.
    Callers should merge this result with regex output, letting non-None
    spaCy values take precedence.
    """
    nlp = _get_nlp()
    excerpt = text[:1500]
    doc = nlp(excerpt)

    result: Dict[str, Optional[str]] = {
        "importo": None,
        "mittente": None,
        "destinatario": None,
        "scadenza": None,
    }

    # ── importo ──────────────────────────────────────────────────────────────
    # Prefer entities that explicitly contain a currency symbol or "euro".
    money_ents = [e for e in doc.ents if e.label_ == "MONEY"]
    if money_ents:
        currency_ents = [e for e in money_ents if re.search(r'[€$]|euro', e.text, re.I)]
        result["importo"] = (currency_ents or money_ents)[0].text.strip()

    # ── mittente / destinatario ───────────────────────────────────────────────
    result["mittente"]     = _find_role_entity(doc, _SENDER_INDICATORS)
    result["destinatario"] = _find_role_entity(doc, _RECIPIENT_INDICATORS)

    # Prevent the same entity being assigned to both roles
    if result["mittente"] and result["mittente"] == result["destinatario"]:
        result["destinatario"] = None

    # ── scadenza ──────────────────────────────────────────────────────────────
    # Accept a DATE entity only when a deadline keyword appears in the
    # _CONTEXT_WINDOW_CHARS characters before it.
    for ent in doc.ents:
        if ent.label_ == "DATE":
            context = _text_before(excerpt, ent.start_char)
            if _DEADLINE_CTX.search(context):
                result["scadenza"] = ent.text.strip()
                break

    return result
