import re
import difflib
from typing import Optional

# Global SpaCy instance (loaded once, optimized)
_nlp = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        try:
            import spacy
            _nlp = spacy.load("it_core_news_lg", disable=["tagger", "parser", "attribute_ruler", "lemmatizer"])
        except (ImportError, Exception):
            return None
    return _nlp

# Italian month names and abbreviations → zero-padded numeric strings.
_MONTHS_IT: dict[str, str] = {
    "gennaio": "01",  "febbraio": "02", "marzo": "03",    "aprile": "04",
    "maggio": "05",   "giugno": "06",   "luglio": "07",   "agosto": "08",
    "settembre": "09","ottobre": "10",  "novembre": "11", "dicembre": "12",
}
# Short versions separately for clearer fuzzy matching
_MONTHS_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"]
_ALL_MONTH_KEYS = list(_MONTHS_IT.keys()) + _MONTHS_SHORT

_MONTH_PATTERN = (
    r"gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto"
    r"|settembre|ottobre|novembre|dicembre"
    r"|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic"
)

_RE_LONGHAND = re.compile(
    rf"il\s+giorno\s+(\d{{1,2}})(?:\s+del\s+mese\s+di)?\s+"
    rf"({_MONTH_PATTERN})\s+dell['\s]+anno\s+(\d{{4}})",
    re.IGNORECASE,
)

_RE_WRITTEN = re.compile(
    rf"(?:lì\s+)?(\d{{1,2}})\s+([a-z]{{3,10}})\.?\s+([0-9z]{{2,4}})", 
    re.IGNORECASE,
)

_RE_NUMERIC = re.compile(r"(\d{1,2})[\/\-\.](\d{1,2}|o[0-9]|O[0-9])[\/\-\.]([0-9z]{4})", re.IGNORECASE)


def _get_month_num(raw: str) -> str:
    key = raw.lower().rstrip(".")
    if key in _MONTHS_IT: return _MONTHS_IT[key]
    if key in _MONTHS_SHORT: return _MONTHS_IT[list(_MONTHS_IT.keys())[_MONTHS_SHORT.index(key)]]
    
    # Fuzzy match for OCR noise (e.g. "rnarzo")
    matches = difflib.get_close_matches(key, _ALL_MONTH_KEYS, n=1, cutoff=0.6)
    if matches:
        m = matches[0]
        if m in _MONTHS_IT: return _MONTHS_IT[m]
        return _MONTHS_IT[list(_MONTHS_IT.keys())[_MONTHS_SHORT.index(m)]]
    return "??"


def _year_normalize(y_raw: str) -> str:
    # Handle OCR noise like '20:' or 'Z0Z3'
    # First, try to see if it's already a clean 4-digit year
    if y_raw.isdigit() and len(y_raw) == 4:
        return y_raw
        
    clean = y_raw.lower().replace('o', '0').replace('z', '2').replace('s', '5').replace(':', '')
    only_digits = "".join([c for c in clean if c.isdigit()])
    
    if len(only_digits) == 4:
        return only_digits
    if len(only_digits) == 2:
        val = int(only_digits)
        # Year 20xx for < 50, 19xx for >= 50
        prefix = "20" if val < 50 else "19"
        return prefix + only_digits
    if len(only_digits) == 1:
        # Extreme case: just one digit? Pad with 202
        return "202" + only_digits
    # If 3 digits or more/less, try to find a 4-digit year or default to 2024
    if len(only_digits) >= 2:
         val = int(only_digits[:2])
         prefix = "20" if val < 50 else "19"
         return prefix + only_digits[:2]
         
    return "2024" # Ultimate fallback


def _numeric_normalize(val: str) -> str:
    # Remove any non-digit chars and zfill
    clean = "".join([c for c in val if c.isdigit() or c.lower() in ('o', '0')])
    clean = clean.replace('o', '0').replace('O', '0')
    return clean.zfill(2)


def extract_date(text: str) -> Optional[str]:
    if not text: return None

    # Step 1: REGEX (Direct match)
    zones = [text[:800], text] if len(text) > 800 else [text]
    for zone in zones:
        # Longhand
        m = _RE_LONGHAND.search(zone)
        if m:
            m_num = _get_month_num(m.group(2))
            if m_num != "??": 
                y = _year_normalize(m.group(3))
                return f"{m.group(1).zfill(2)}/{m_num}/{y}"
        
        # Written (Permissive)
        m = _RE_WRITTEN.search(zone)
        if m:
            m_num = _get_month_num(m.group(2))
            if m_num != "??":
                y = _year_normalize(m.group(3))
                return f"{m.group(1).zfill(2)}/{m_num}/{y}"
        
        # Numeric (With OCR noise resilience)
        # Permissive on month (1-2 chars) and year (2-4 chars)
        m_num_regex = re.compile(r"(\d{1,2})[\/\-\.]([0-9oO]{1,2})[\/\-\.]([0-9ozZ:]{2,4})")
        m = m_num_regex.search(zone)
        if m:
            d = _numeric_normalize(m.group(1))
            m_val = _numeric_normalize(m.group(2))
            y = _year_normalize(m.group(3))
            return f"{d}/{m_val}/{y}"

    # Step 2: SPA-CY NER (Contextual discovery)
    nlp = _get_nlp()
    if nlp:
        doc = nlp(text[:1200])
        for ent in doc.ents:
            if ent.label_ == "DATE":
                # Run the permissive regex on the found entity
                m = _RE_WRITTEN.search(ent.text)
                if m:
                    m_num = _get_month_num(m.group(2))
                    if m_num != "??":
                        y = _year_normalize(m.group(3))
                        return f"{m.group(1).zfill(2)}/{m_num}/{y}"
                
                m_num_regex = re.compile(r"(\d{1,2})[\/\-\.]([0-9oO]{1,2})[\/\-\.]([0-9ozZ:]{2,4})")
                m = m_num_regex.search(ent.text)
                if m:
                    d = _numeric_normalize(m.group(1))
                    m_val = _numeric_normalize(m.group(2))
                    y = _year_normalize(m.group(3))
                    return f"{d}/{m_val}/{y}"

    return None




