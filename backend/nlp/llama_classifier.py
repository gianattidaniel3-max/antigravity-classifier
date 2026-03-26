import json
import requests
from typing import Dict, Optional
from backend.nlp.taxonomy import load as load_taxonomy

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "llama3.2:3b"

def llama_classify(text: str) -> Optional[dict]:
    """
    Classify document using Llama 3.2 via Ollama.
    Returns: {"label": str, "category": str, "score": float}
    """
    taxonomy = load_taxonomy()
    excerpt = text[:1500].strip()
    
    # Format taxonomy for prompt
    taxo_str = ""
    for cat, labels in taxonomy.items():
        taxo_str += f"- {cat}: {', '.join(labels)}\n"

    prompt = (
        "Sei un esperto classificatore di documenti legali italiani.\n"
        "Data la seguente tassonomia (Categoria: lista di etichette possibili):\n\n"
        f"{taxo_str}\n"
        "Analizza il testo fornito e identifica la categoria e l'etichetta più appropriata.\n"
        "Restituisci SOLO un oggetto JSON con questa struttura:\n"
        "{\"category\": \"nome_categoria\", \"label\": \"nome_etichetta\", \"score\": 0.95}\n\n"
        f"Testo:\n\"\"\"\n{excerpt}\n\"\"\""
    )

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.0},
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        result = json.loads(content)
        
        # Validation
        if "category" in result and "label" in result:
            return {
                "category": str(result["category"]).strip(),
                "label": str(result["label"]).strip(),
                "score": float(result.get("score", 0.90))
            }
        return None
    except Exception as e:
        print(f"[llama_classifier] Error: {e}")
        return None
