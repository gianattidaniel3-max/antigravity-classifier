import os
import sys

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.nlp.classifier import classify_legal_text
import pytesseract
from PIL import Image, ImageDraw

def test_pipeline():
    # 1. Test OCR with local data
    # Path to the directory containing ita.traineddata
    tessdata_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "resources", "tessdata"))
    config = f'--tessdata-dir "{tessdata_dir}"'
    
    print(f"Testing OCR with config: {config}")
    
    # Create test image
    img = Image.new('RGB', (400, 100), color = (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((10,10), "CONTRATTO DI MUTUO IPOTECARIO", fill=(0,0,0))
    d.text((10,40), "Il sottoscritto Mario Rossi...", fill=(0,0,0))
    
    try:
        print("Starting OCR...")
        text = pytesseract.image_to_string(img, lang="ita", config=config)
        print(f"OCR Finished. Result length: {len(text)}")
        print(f"OCR Result: {text.strip()}")
        
        # 2. Test Classification
        if text.strip():
            print("Starting classification...")
            result = classify_legal_text(text)
            print(f"Classification Result: {result}")
        else:
            print("OCR returned empty text. check ita.traineddata existence.")
            
    except Exception as e:
        print(f"Pipeline Error: {e}")

if __name__ == "__main__":
    test_pipeline()
