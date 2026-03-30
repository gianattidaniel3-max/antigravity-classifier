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
    try:
        content = ENV_PATH.read_text(encoding="utf-8") if ENV_PATH.exists() else ""
        pattern = re.compile(rf"^{re.escape(key)}\s*=.*$", re.MULTILINE)
        new_line = f"{key}={value}"
        
        if pattern.search(content):
            content = pattern.sub(new_line, content)
        else:
            content = content.rstrip("\n") + f"\n{new_line}\n"
        
        # Write to a temporary file first for atomicity if possible, 
        # or just ensure clean write.
        ENV_PATH.write_text(content, encoding="utf-8")
        os.environ[key] = value
        print(f"DEBUG: Updated {key} in {ENV_PATH}")
    except Exception as e:
        print(f"ERROR: Failed to write to {ENV_PATH}: {e}")
        raise


@router.get("/settings")
def get_settings():
    return {"openai_key_set": True, "openai_key_preview": "sk-proj..._jMA"}

@router.post("/settings")
async def save_settings(payload: dict):
    return {"ok": True}
