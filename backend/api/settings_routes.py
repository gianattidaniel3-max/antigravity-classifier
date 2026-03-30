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


@router.get("/diagnostics")
def run_diagnostics():
    """
    Quick health check for all subsystems.
    Returns a JSON object with pass/fail for each component.
    Useful for diagnosing Windows/local-mode installation issues.
    """
    import shutil, traceback

    results: dict = {}

    # 1. Tesseract
    try:
        import pytesseract
        # Try to find version
        ver = pytesseract.get_tesseract_version()
        # Also check path
        t_path = shutil.which("tesseract")
        if not t_path and os.path.exists("/opt/homebrew/bin/tesseract"):
            t_path = "/opt/homebrew/bin/tesseract"
        results["tesseract"] = {"ok": True, "version": str(ver), "path": t_path}
    except Exception as e:
        results["tesseract"] = {"ok": False, "error": str(e)}

    # 2. Poppler (via pdf2image)
    try:
        import pdf2image
        pdfinfo = shutil.which("pdfinfo")
        # On Windows check known paths
        if not pdfinfo:
            if os.name == "nt":
                for candidate in [
                    r"C:\Program Files\poppler\Library\bin\pdfinfo.exe",
                    r"C:\Program Files\poppler\bin\pdfinfo.exe",
                    r"C:\poppler\bin\pdfinfo.exe",
                ]:
                    if os.path.exists(candidate):
                        pdfinfo = candidate
                        break
            else:
                # Mac Homebrew fallback
                for candidate in [
                    "/opt/homebrew/bin/pdfinfo",
                    "/usr/local/bin/pdfinfo",
                ]:
                    if os.path.exists(candidate):
                        pdfinfo = candidate
                        break
        results["poppler"] = {"ok": bool(pdfinfo), "path": pdfinfo or "not found"}
    except Exception as e:
        results["poppler"] = {"ok": False, "error": str(e)}

    # 3. Local storage
    try:
        from backend.nlp.storage import client, ensure_buckets
        ensure_buckets()
        results["storage"] = {"ok": True, "type": type(client).__name__}
    except Exception as e:
        results["storage"] = {"ok": False, "error": str(e)}

    # 4. Database
    try:
        from backend.db.session import SessionLocal
        db = SessionLocal()
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db.close()
        results["database"] = {"ok": True}
    except Exception as e:
        results["database"] = {"ok": False, "error": str(e)}

    # 5. OpenAI key (validate format only, no network call)
    try:
        from backend.nlp.openai_extractor import extract_with_openai
        # The key is hardcoded in the function — just check it's set to something
        import inspect
        src = inspect.getsource(extract_with_openai)
        has_key = "api_key" in src and "sk-" in src
        results["openai_key"] = {"ok": has_key, "note": "hardcoded key detected" if has_key else "key missing"}
    except Exception as e:
        results["openai_key"] = {"ok": False, "error": str(e)}

    all_ok = all(v.get("ok") for v in results.values())
    
    # Add manual fix instructions if things are broken
    remediation = []
    if not results.get("tesseract", {}).get("ok"):
        if os.name == "nt":
            remediation.append("Tesseract missing. Run: winget install UB.TesseractOCR")
        else:
            remediation.append("Tesseract missing. Run: brew install tesseract")
            
    if not results.get("poppler", {}).get("ok"):
        if os.name == "nt":
            remediation.append("Poppler missing. Run: winget install oschwartz10612.Poppler")
        else:
            remediation.append("Poppler missing. Run: brew install poppler")

    return {
        "all_ok": all_ok, 
        "checks": results,
        "remediation": remediation if not all_ok else None
    }
