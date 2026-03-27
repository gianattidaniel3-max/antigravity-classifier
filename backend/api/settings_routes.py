"""
Settings endpoint — reads and writes OPENAI_API_KEY in the .env file.
Changes take effect immediately (os.environ updated in-place).
"""
import os
import re
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

ENV_PATH = Path(__file__).parent.parent / ".env"


def _read_env() -> dict:
    """Parse .env into a dict."""
    result: dict = {}
    if not ENV_PATH.exists():
        return result
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, _, v = line.partition("=")
            result[k.strip()] = v.strip()
    return result


def _write_env_key(key: str, value: str):
    """Set or add a key in the .env file, then refresh os.environ."""
    content = ENV_PATH.read_text(encoding="utf-8") if ENV_PATH.exists() else ""
    pattern = re.compile(rf"^{re.escape(key)}\s*=.*$", re.MULTILINE)
    new_line = f"{key}={value}"
    if pattern.search(content):
        content = pattern.sub(new_line, content)
    else:
        content = content.rstrip("\n") + f"\n{new_line}\n"
    ENV_PATH.write_text(content, encoding="utf-8")
    os.environ[key] = value


@router.get("/settings")
def get_settings():
    raw = os.getenv("OPENAI_API_KEY", "")
    is_set = bool(raw and raw.startswith("sk-"))
    preview = (raw[:8] + "..." + raw[-4:]) if is_set else ""
    return {"openai_key_set": is_set, "openai_key_preview": preview}


@router.post("/settings")
def save_settings(payload: dict):
    key = (payload.get("openai_api_key") or "").strip()
    if not key:
        return {"ok": False, "error": "La chiave non può essere vuota"}
    if not key.startswith("sk-"):
        return {"ok": False, "error": "La chiave deve iniziare con sk-"}
    _write_env_key("OPENAI_API_KEY", key)
    return {"ok": True}
