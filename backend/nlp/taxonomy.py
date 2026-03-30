"""
Single source of truth for the document taxonomy.
Reads from and writes to taxonomy.json so changes persist across restarts
and are immediately picked up by the classifier (no restart needed).
"""
import json
import os
import threading

_PATH = os.path.join(os.path.dirname(__file__), "..", "resources", "taxonomy.json")
_lock = threading.Lock()


def load() -> dict[str, list[str]]:
    with _lock:
        with open(_PATH, "r", encoding="utf-8") as f:
            return json.load(f)


def save(taxonomy: dict[str, list[str]]) -> None:
    with _lock:
        with open(_PATH, "w", encoding="utf-8") as f:
            json.dump(taxonomy, f, ensure_ascii=False, indent=2)


def add_category(name: str) -> dict:
    t = load()
    if name in t:
        raise ValueError(f"Category '{name}' already exists")
    t[name] = []
    save(t)
    return t


def delete_category(name: str) -> dict:
    t = load()
    if name not in t:
        raise KeyError(f"Category '{name}' not found")
    if t[name]:
        raise ValueError(f"Category '{name}' is not empty — move its labels first")
    del t[name]
    save(t)
    return t


def add_label(category: str, label: str) -> dict:
    t = load()
    if category not in t:
        raise KeyError(f"Category '{category}' not found")
    label = label.strip().lower()
    # Check label is not already in any category
    for cat, labels in t.items():
        if label in labels:
            raise ValueError(f"Label '{label}' already exists in '{cat}'")
    t[category].append(label)
    save(t)
    return t


def delete_label(category: str, label: str) -> dict:
    t = load()
    if category not in t or label not in t[category]:
        raise KeyError(f"Label '{label}' not found in '{category}'")
    t[category].remove(label)
    save(t)
    return t


def move_label(label: str, from_category: str, to_category: str) -> dict:
    t = load()
    if from_category not in t:
        raise KeyError(f"Category '{from_category}' not found")
    if to_category not in t:
        raise KeyError(f"Category '{to_category}' not found")
    if label not in t[from_category]:
        raise KeyError(f"Label '{label}' not found in '{from_category}'")
    t[from_category].remove(label)
    t[to_category].append(label)
    save(t)
    return t
