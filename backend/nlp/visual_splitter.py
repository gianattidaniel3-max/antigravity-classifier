import torch
from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import numpy as np
from typing import List, Tuple

class VisualSplitter:
    def __init__(self, model_name: str = "openai/clip-vit-base-patch32"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained(model_name).to(self.device).eval()
        self.processor = CLIPProcessor.from_pretrained(model_name)

    @torch.no_grad()
    def get_page_embeddings(self, images: List[Image.Image]) -> np.ndarray:
        """Generate normalized embeddings for a list of PIL images."""
        inputs = self.processor(images=images, return_tensors="pt", padding=True).to(self.device)
        outputs = self.model.get_image_features(**inputs)
        # Normalize
        embeddings = outputs / outputs.norm(dim=-1, keepdim=True)
        return embeddings.cpu().numpy()

    def suggest_splits(self, embeddings: np.ndarray, threshold: float = 0.85) -> List[dict]:
        """
        Compare adjacent page embeddings using cosine similarity.
        Suggests a split where similarity < threshold.
        """
        suggestions = []
        num_pages = len(embeddings)
        
        for i in range(num_pages - 1):
            # Cosine similarity is just dot product since embeddings are normalized
            sim = float(np.dot(embeddings[i], embeddings[i+1]))
            
            if sim < threshold:
                suggestions.append({
                    "after_page": i + 1, # 1-indexed for the UI
                    "similarity": round(sim, 3),
                    "reason": "visual_change"
                })
        
        return suggestions

# Global instance to avoid reloading model
_instance = None

def get_visual_splitter():
    global _instance
    if _instance is None:
        _instance = VisualSplitter()
    return _instance
