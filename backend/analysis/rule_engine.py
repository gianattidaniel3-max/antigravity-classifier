"""
Rule engine for Case Analysis.

Each rule is a dict:
    {
        "field":      "label" | "category" | "date" | <extracted_fields key>,
        "op":         "eq" | "neq" | "contains" | "gt" | "lt" | "is_null" | "not_null" | "in",
        "value":      <string | list | None>,   # not needed for is_null / not_null
        "flag_label": "optional human name for this flag"
    }

run_analysis() returns a list of result dicts (one per document), plus an overall summary.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import datetime


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_field(doc_dict: Dict, field: str) -> Optional[str]:
    """Resolve a rule field name against a document dict."""
    if field == "label":
        return doc_dict.get("extracted_label")
    if field == "category":
        return doc_dict.get("extracted_category")
    if field == "date":
        return doc_dict.get("extracted_date")
    # Extracted fields (importo, mittente, …)
    fields = doc_dict.get("extracted_fields") or {}
    return fields.get(field)


def _parse_amount(val: str) -> Optional[float]:
    """Convert Italian-formatted amounts like '15.000,00' to float."""
    try:
        return float(val.replace(".", "").replace(",", "."))
    except Exception:
        return None


def _parse_date(val: str) -> Optional[datetime.date]:
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(val.strip(), fmt).date()
        except Exception:
            pass
    return None


def _evaluate(rule: Dict, doc_dict: Dict) -> bool:
    """Return True if the rule matches the document."""
    field = rule.get("field", "")
    op    = rule.get("op", "eq")
    value = rule.get("value")

    raw = _get_field(doc_dict, field)

    if op == "is_null":
        return raw is None or str(raw).strip() == ""
    if op == "not_null":
        return raw is not None and str(raw).strip() != ""

    # For all other ops a non-null raw value is required
    if raw is None:
        return False

    raw_s = str(raw).lower().strip()

    if op == "eq":
        return raw_s == str(value).lower().strip()
    if op == "neq":
        return raw_s != str(value).lower().strip()
    if op == "contains":
        return str(value).lower() in raw_s
    if op == "in":
        return raw_s in [str(v).lower().strip() for v in (value or [])]
    if op in ("gt", "lt"):
        # Try numeric comparison first, then date
        num_raw = _parse_amount(raw)
        num_val = _parse_amount(str(value)) if value is not None else None
        if num_raw is not None and num_val is not None:
            return num_raw > num_val if op == "gt" else num_raw < num_val
        date_raw = _parse_date(raw)
        date_val = _parse_date(str(value)) if value is not None else None
        if date_raw is not None and date_val is not None:
            return date_raw > date_val if op == "gt" else date_raw < date_val

    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_analysis(
    documents: List[Dict],
    rules: List[Dict],
) -> tuple[List[Dict], Dict]:
    """
    Apply rules to each document.

    Parameters
    ----------
    documents : list of document dicts (id, filename, extracted_label,
                extracted_category, extracted_date, extracted_fields, status)
    rules     : list of rule dicts (see module docstring)

    Returns
    -------
    results : list of {document_id, filename, label, triggered_rules}
              — only documents that triggered at least one rule are included
    summary : {total, flagged, by_rule: {flag_label: count}}
    """
    results: List[Dict] = []
    by_rule: Dict[str, int] = {}

    for doc in documents:
        triggered: List[Dict] = []
        for rule in rules:
            if _evaluate(rule, doc):
                triggered.append({
                    "field":       rule.get("field"),
                    "op":          rule.get("op"),
                    "value":       rule.get("value"),
                    "flag_label":  rule.get("flag_label", ""),
                    "found_value": _get_field(doc, rule.get("field", "")),
                })
                key = rule.get("flag_label") or f"{rule.get('field')}_{rule.get('op')}"
                by_rule[key] = by_rule.get(key, 0) + 1

        if triggered:
            results.append({
                "document_id":     doc.get("id"),
                "filename":        doc.get("filename"),
                "label":           doc.get("extracted_label", ""),
                "category":        doc.get("extracted_category", ""),
                "date":            doc.get("extracted_date", ""),
                "extracted_fields": doc.get("extracted_fields", {}),
                "triggered_rules": triggered,
            })

    summary = {
        "total":   len(documents),
        "flagged": len(results),
        "by_rule": by_rule,
    }
    return results, summary


def format_case_context(documents: List[Dict]) -> str:
    """
    Format a concise string representation of all documents in the case
    for LLM consumption.
    """
    lines = ["Dataset del Fascicolo:"]
    lines.append("-" * 30)
    for i, doc in enumerate(documents, 1):
        label = doc.get("extracted_label", "N/A")
        cat   = doc.get("extracted_category", "N/A")
        date  = doc.get("extracted_date", "N/A")
        fields = doc.get("extracted_fields") or {}
        
        info = f"{i}. {doc.get('filename')} | Tipo: {label} | Cat: {cat} | Data: {date}"
        if fields:
            f_str = ", ".join(f"{k}: {v}" for k, v in fields.items() if v)
            if f_str:
                info += f" | Campi: {f_str}"
        lines.append(info)
    
    return "\n".join(lines)
