import pytesseract
from PIL import Image, ImageDraw
import os

# Create a dummy image with some text
img = Image.new('RGB', (200, 100), color=(255, 255, 255))
d = ImageDraw.Draw(img)
d.text((10, 10), "Test OCR 123", fill=(0, 0, 0))

print("Testing pytesseract...")
try:
    text = pytesseract.image_to_string(img, lang="ita")
    print(f"Result: '{text.strip()}'")
except Exception as e:
    print(f"Error: {e}")
