import pytesseract
from PIL import Image, ImageDraw
import os

# Create a dummy image with some text
img = Image.new('RGB', (200, 100), color=(255, 255, 255))
d = ImageDraw.Draw(img)
d.text((10, 10), "Test OCR 123", fill=(0, 0, 0))

local_tessdata = "/Users/danielgianatti/Documents/Antigravity-Master/Projects/file_classifier/backend/resources/tessdata"
tess_config = f'--tessdata-dir "{local_tessdata}"'

print(f"Testing pytesseract with local tessdata: {local_tessdata}...")
try:
    text = pytesseract.image_to_string(img, lang="ita", config=tess_config)
    print(f"Result: '{text.strip()}'")
except Exception as e:
    print(f"Error: {e}")
