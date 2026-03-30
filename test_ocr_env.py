import pytesseract
from PIL import Image, ImageDraw
import os

# Create a dummy image with some text
img = Image.new('RGB', (200, 100), color=(255, 255, 255))
d = ImageDraw.Draw(img)
d.text((10, 10), "Test OCR 123", fill=(0, 0, 0))

local_tessdata = "/Users/danielgianatti/Documents/Antigravity-Master/Projects/file_classifier/backend/resources/tessdata"
os.environ["TESSDATA_PREFIX"] = local_tessdata

# Also set the tesseract cmd path explicitly if needed
pytesseract.pytesseract.tesseract_cmd = "/opt/homebrew/bin/tesseract"

print(f"Testing pytesseract with TESSDATA_PREFIX={local_tessdata}...")
try:
    # Use NO config to see if it picks up the environment variable
    text = pytesseract.image_to_string(img, lang="ita")
    print(f"Result: '{text.strip()}'")
except Exception as e:
    print(f"Error: {e}")
