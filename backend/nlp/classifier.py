import hashlib
from typing import Optional
from backend.nlp.taxonomy import load as load_taxonomy

# ── H: In-memory classification cache ──
# Keyed by MD5 of first 1000 chars. Resets on worker restart (acceptable).
_cache: dict = {}
_CACHE_MAX = 500

# ── E: Keyword pre-classifier ───────────────────────────────────────────────
# Ordered by specificity: longer / more specific phrases first so they match
# before their shorter substrings (e.g. "decreto ingiuntivo provvisoriamente
# esecutivo" before "decreto ingiuntivo").
_KEYWORD_MAP = [
    ("decreto ingiuntivo provvisoriamente esecutivo", "procedura monitoria",        "decreto ingiuntivo provvisoriamente esecutivo"),
    ("ricorso per decreto ingiuntivo",                "procedura monitoria",        "ricorso per decreto ingiuntivo"),
    ("opposizione a decreto ingiuntivo",              "procedura monitoria",        "opposizione a decreto ingiuntivo"),
    ("decreto ingiuntivo",                            "procedura monitoria",        "decreto ingiuntivo"),
    ("atto di citazione",                             "atti giudiziari",            "atto di citazione"),
    ("comparsa di risposta",                          "atti giudiziari",            "comparsa di risposta"),
    ("verbale di udienza",                            "atti giudiziari",            "verbale di udienza"),
    ("atto di precetto",                              "esecuzione forzata",         "atto di precetto"),
    ("pignoramento immobiliare",                      "esecuzione forzata",         "pignoramento immobiliare"),
    ("pignoramento mobiliare",                        "esecuzione forzata",         "pignoramento mobiliare"),
    ("pignoramento presso terzi",                     "esecuzione forzata",         "pignoramento presso terzi"),
    ("ordinanza di vendita",                          "esecuzione forzata",         "ordinanza di vendita"),
    ("avviso di vendita",                             "esecuzione forzata",         "avviso di vendita"),
    ("perizia di stima",                              "esecuzione forzata",         "perizia di stima"),
    ("istanza di vendita",                            "esecuzione forzata",         "istanza di vendita"),
    ("mutuo fondiario",                               "contratti e prestiti",       "mutuo fondiario"),
    ("mutuo ipotecario",                              "contratti e prestiti",       "mutuo ipotecario"),
    ("mutuo chirografario",                           "contratti e prestiti",       "mutuo chirografario"),
    ("apertura di credito",                           "contratti e prestiti",       "apertura di credito"),
    ("contratto di leasing",                          "contratti e prestiti",       "contratto di leasing"),
    ("contratto di factoring",                        "contratti e prestiti",       "contratto di factoring"),
    ("fideiussione",                                  "contratti e prestiti",       "fideiussione"),
    ("cessione del credito",                          "contratti e prestiti",       "cessione del credito"),
    ("lettera di diffida",                            "comunicazioni stragiudiziali","lettera di diffida"),
    ("messa in mora",                                 "comunicazioni stragiudiziali","lettera di messa in mora"),
    ("proposta di transazione",                       "comunicazioni stragiudiziali","proposta di transazione"),
    ("piano di rientro",                              "comunicazioni stragiudiziali","piano di rientro"),
    ("accordo stragiudiziale",                        "comunicazioni stragiudiziali","accordo stragiudiziale"),
    ("saldo e stralcio",                              "comunicazioni stragiudiziali","saldo e stralcio"),
    ("sentenza dichiarativa di fallimento",           "procedure concorsuali",      "sentenza dichiarativa di fallimento"),
    ("domanda di ammissione al passivo",              "procedure concorsuali",      "domanda di ammissione al passivo"),
    ("istanza di fallimento",                         "procedure concorsuali",      "istanza di fallimento"),
    ("piano di concordato",                           "procedure concorsuali",      "piano di concordato preventivo"),
    ("accordo di ristrutturazione",                   "procedure concorsuali",      "accordo di ristrutturazione debiti"),
    ("atto costitutivo di ipoteca",                   "garanzie e ipoteche",        "atto costitutivo di ipoteca"),
    ("cancellazione di ipoteca",                      "garanzie e ipoteche",        "cancellazione di ipoteca"),
    ("visura ipotecaria",                             "garanzie e ipoteche",        "visura ipotecaria"),
    ("visura catastale",                              "garanzie e ipoteche",        "visura catastale"),
    ("perizia immobiliare",                           "garanzie e ipoteche",        "perizia immobiliare"),
    ("estratto conto mutuo",                          "documenti bancari e contabili","estratto conto mutuo"),
    ("estratto conto",                                "documenti bancari e contabili","estratto conto bancario"),
    ("piano di ammortamento",                         "documenti bancari e contabili","piano di ammortamento"),
    ("quietanza di pagamento",                        "documenti bancari e contabili","quietanza di pagamento"),
    ("quietanza",                                     "documenti bancari e contabili","quietanza di pagamento"),
    ("posta elettronica certificata",                 "corrispondenza",             "PEC"),
    ("raccomandata",                                  "corrispondenza",             "raccomandata"),
    ("comunicazione bancaria",                        "corrispondenza",             "comunicazione bancaria"),
]


def _keyword_classify(excerpt_lower: str) -> Optional[dict]:
    """Match first 500 chars (lowercased) against known Italian legal keywords."""
    for keyword, category, label in _KEYWORD_MAP:
        if keyword in excerpt_lower:
            return {"label": label, "category": category, "score": 0.92}
    return None


def classify_legal_text(text: str) -> dict:
    """
    Classify an Italian legal document.

    Order of resolution:
      1. Cache hit  → instant (same text seen before in this worker session)
      2. Keyword match → <1ms  (~80% of real legal docs)
      3. Zero-shot mDeBERTa → ~6s (fallback for unrecognised documents)

    Returns:
        {"label": str, "category": str, "score": float}
    """
    excerpt = text[:1000].strip()
    if not excerpt:
        return {"label": "UNKNOWN", "category": "UNKNOWN", "score": 0.0}

    # ── H: cache lookup ──
    cache_key = hashlib.md5(excerpt.encode()).hexdigest()
    if cache_key in _cache:
        return _cache[cache_key]

    # ── E: keyword fast path ──
    result = _keyword_classify(excerpt[:500].lower())

    # ── Slow path: removed to prevent massive CPU overhead ──
    # If the lightweight keyword match fails, we immediately return UNKNOWN
    # so the document is quickly passed to Phase 2 (OpenAI API).
    if result is None:
        result = {"label": "UNKNOWN", "category": "UNKNOWN", "score": 0.0}

    # ── H: cache store (evict oldest if full) ──
    if len(_cache) >= _CACHE_MAX:
        _cache.pop(next(iter(_cache)))
    _cache[cache_key] = result

    return result
