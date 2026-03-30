"""
OpenAI Vision extractor with automatic model selection.

Model selection logic (all thresholds configurable via .env):
  - OPENAI_VISION_MODEL  → hard override (e.g. force "gpt-4o-mini" everywhere)
  - Otherwise, chooses between gpt-4o and gpt-4o-mini based on two signals:
      1. Page count   : if pages <= OPENAI_MINI_MAX_PAGES (default 5) → mini candidate
      2. OCR confidence: if score >= OPENAI_MINI_MIN_SCORE (default 0.80) → mini candidate
    Both conditions must hold to use mini; if either fails → gpt-4o.

Rationale:
  - Short docs where the keyword classifier is already confident rarely need
    the full model — mini extracts fields faster and at ~10x lower cost.
  - Long or ambiguous docs (score=0.0 = keyword miss) warrant gpt-4o's
    stronger reasoning and better vision accuracy.
"""
import os
import io
import json
import base64

# Default thresholds (overridable via .env)
_DEFAULT_MINI_MAX_PAGES  = 5     # docs with <= N pages are mini candidates
_DEFAULT_MINI_MIN_SCORE  = 0.80  # OCR confidence must be >= this to use mini

# Page budget per model (overridable via .env)
# Italian legal docs contain all key fields within the first few pages.
# Sending 20 pages costs ~10× more tokens with near-zero accuracy gain.
_DEFAULT_MINI_PAGE_BUDGET = 5    # gpt-4o-mini: first N pages
_DEFAULT_GPT4O_PAGE_BUDGET = 8   # gpt-4o: first N pages

_FIELD_DESCRIPTIONS: dict[str, str] = {
    "mittente":       "sender (name or entity that issued the document)",
    "destinatario":   "recipient (name or entity the document is addressed to)",
    "importo":        "monetary amount (principal, debt, or payment figure, with currency)",
    "scadenza":       "deadline or due date",
    "tribunale":      "court name",
    "numero_decreto": "decree or injunction number",
    "numero_rg":      "court registry number (numero di ruolo generale)",
    "oggetto":        "subject or matter of the document",
}


def _select_model(page_count: int, ocr_score: float) -> str:
    """
    Return the OpenAI model to use for this document.

    Priority:
      1. OPENAI_VISION_MODEL env var  → hard override, used as-is
      2. Both thresholds satisfied    → gpt-4o-mini  (cheap + fast)
      3. Otherwise                    → gpt-4o        (accurate + robust)
    """
    override = os.getenv("OPENAI_VISION_MODEL", "").strip()
    if override:
        return override

    max_pages  = int(os.getenv("OPENAI_MINI_MAX_PAGES", str(_DEFAULT_MINI_MAX_PAGES)))
    min_score  = float(os.getenv("OPENAI_MINI_MIN_SCORE", str(_DEFAULT_MINI_MIN_SCORE)))

    if page_count <= max_pages and ocr_score >= min_score:
        return "gpt-4o-mini"
    return "gpt-4o"


def _to_base64_png(image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def extract_with_openai(
    images: list,
    temp_label: str,
    temp_category: str,
    temp_score: float,
    ocr_page1_text: str,
    field_schema: dict,
    taxonomy: dict,
) -> dict:
    """
    Call the selected OpenAI Vision model and return structured extraction.

    Returns:
        {
            "label": str,
            "category": str,
            "confidence": "high" | "medium" | "low",
            "ocr_agrees": bool,
            "fields": {field_name: value_or_null, ...},
            "notes": str,
            "model_used": str,   ← which model was actually called
        }
    """
    # Hardcoded for the Microsoft User Version
    api_key = (
        "sk-proj-twOpqaWCC4BlwsoHV0ftI-DAZLka2SSOJ"
        "FNcXRRs8n1Y3my8UeB4en9i6l8WzrDF40gKvpfKZa"
        "T3BlbkFJnuSEQ6j9PH1LdhgB6skT0ruHETS1Otkq-"
        "YlKQY9EnGSS47tJFY1FRkS7z0KitsNUPHfklV_jMA"
    )
    
    import openai
    client = openai.OpenAI(api_key=api_key)

    page_count = len(images)
    model      = _select_model(page_count, temp_score)

    # Page budget: how many pages to actually send to the vision API.
    # Key info in Italian legal docs is almost always in the first few pages.
    # Sending more pages = more tokens, higher cost, slower response, no accuracy gain.
    if model == "gpt-4o-mini":
        page_budget = int(os.getenv("OPENAI_MINI_PAGE_BUDGET", str(_DEFAULT_MINI_PAGE_BUDGET)))
    else:
        page_budget = int(os.getenv("OPENAI_GPT4O_PAGE_BUDGET", str(_DEFAULT_GPT4O_PAGE_BUDGET)))

    pages_to_send = images[:page_budget]
    print(f"[openai_extractor] {page_count}p doc → {model}, sending {len(pages_to_send)} page(s) (OCR score={temp_score:.0%})")

    # Build taxonomy string preserving category grouping.
    # Sending the structure (not a flat alphabetical list) helps GPT understand
    # that e.g. "decreto ingiuntivo" and "ricorso per decreto ingiuntivo" belong
    # to the same procedura monitoria family.
    taxonomy_lines = []
    for category, labels in taxonomy.items():
        taxonomy_lines.append(f"  [{category}]")
        for lbl in labels:
            taxonomy_lines.append(f"    - {lbl}")
    taxonomy_str = "\n".join(taxonomy_lines)

    # Build the FULL field schema for every document type.
    # This is critical: if GPT disagrees with the OCR classification it can still
    # extract the correct fields for the type IT identifies, rather than being
    # constrained to the (possibly wrong) OCR-guessed type's schema.
    schema_lines = []
    for doc_type, fields in field_schema.items():
        if fields:
            field_descs = ", ".join(
                f'"{f}" ({_FIELD_DESCRIPTIONS.get(f, f)})' for f in fields
            )
            schema_lines.append(f"  {doc_type}: {field_descs}")
    full_schema_str = "\n".join(schema_lines)

    # Highlight the OCR-guessed type so GPT treats it as the starting hypothesis
    ocr_fields = field_schema.get(temp_label, [])
    ocr_hint = (
        f"The preliminary OCR suggests \"{temp_label}\". "
        f"If you agree, extract: {', '.join(ocr_fields) if ocr_fields else 'any key fields'}. "
        f"If you disagree, use the schema above for the type you identify instead."
    )

    system_prompt = (
        "You are an expert in Italian legal and banking documents. "
        "Analyse the document images you receive and return ONLY a valid JSON object. "
        "No markdown fences, no explanation outside the JSON."
    )

    user_prompt = f"""Analyse this Italian legal document.

━━ PRELIMINARY OCR CLASSIFICATION ━━
Document type : {temp_label}
Category      : {temp_category}
Confidence    : {temp_score:.0%}

━━ OCR TEXT – PAGE 1 (may contain errors) ━━
{ocr_page1_text[:2500]}

━━ TAXONOMY (categories and valid document types) ━━
{taxonomy_str}

━━ FIELD SCHEMA (fields to extract per document type) ━━
{full_schema_str}

━━ EXTRACTION INSTRUCTIONS ━━
{ocr_hint}

━━ REQUIRED JSON RESPONSE FORMAT ━━
{{
  "label": "<exact label from the taxonomy above, or closest match>",
  "category": "<matching category from the taxonomy>",
  "confidence": "<high | medium | low>",
  "ocr_agrees": <true if your label matches the preliminary OCR label, otherwise false>,
  "fields": {{
    "<field_name>": "<extracted value as a string, or null if not found>"
  }},
  "notes": "<one sentence: any discrepancy with OCR result, ambiguity, or missing info>"
}}"""

    content: list = [{"type": "text", "text": user_prompt}]
    for img in pages_to_send:
        b64 = _to_base64_png(img)
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{b64}",
                "detail": "high",
            },
        })

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": content},
        ],
        max_tokens=1200,
        temperature=0.0,
    )

    raw = response.choices[0].message.content.strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        cleaned = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(cleaned)

    return {
        "label":      str(result.get("label", temp_label)),
        "category":   str(result.get("category", temp_category)),
        "confidence": str(result.get("confidence", "low")),
        "ocr_agrees": bool(result.get("ocr_agrees", False)),
        "fields":     result.get("fields") or {},
        "notes":      str(result.get("notes", "")),
        "model_used": model,
    }
