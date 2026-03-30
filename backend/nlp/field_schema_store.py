"""
Persistent storage for the per-label field extraction schema.
Reads/writes field_schema.json so changes made in the UI are immediately
used by field_extractor.py on the next document processed.
"""
import json
import os
import threading

_PATH = os.path.join(os.path.dirname(__file__), "..", "resources", "field_schema.json")
_lock = threading.Lock()

# All extractor keys available in field_extractor.py
AVAILABLE_FIELDS = [
    "importo",
    "mittente",
    "destinatario",
    "oggetto",
    "scadenza",
    "tribunale",
    "numero_decreto",
    "numero_rg",
]


def load() -> dict[str, list[str]]:
    with _lock:
        with open(_PATH, "r", encoding="utf-8") as f:
            return json.load(f)


def save(schema: dict[str, list[str]]) -> None:
    with _lock:
        with open(_PATH, "w", encoding="utf-8") as f:
            json.dump(schema, f, ensure_ascii=False, indent=2)


def set_label_fields(label: str, fields: list[str]) -> dict:
    """Set the extraction fields for a single label. Creates the entry if missing."""
    unknown = [f for f in fields if f not in AVAILABLE_FIELDS]
    if unknown:
        raise ValueError(f"Unknown fields: {unknown}. Available: {AVAILABLE_FIELDS}")
    schema = load()
    schema[label] = fields
    save(schema)
    return schema


def delete_label(label: str) -> dict:
    """Remove a label's field config (called when a label is deleted from taxonomy)."""
    schema = load()
    schema.pop(label, None)
    save(schema)
    return schema
