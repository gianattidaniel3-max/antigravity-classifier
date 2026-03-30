import pytesseract
from PIL import Image
import os

# Create a dummy image with text
img = Image.new('RGB', (200, 100), color = (255, 255, 255))
from PIL import ImageDraw, ImageFont
d = ImageDraw.Draw(img)
d.text((10,10), "TEST OCR ITALIANO", fill=(0,0,0))
img.save('test_ocr.png')

try:
    print("Running tesseract...")
    text = pytesseract.image_to_string('test_ocr.png', lang='ita')
    print(f"Result: '{text.strip()}'")
finally:
    if os.path.exists('test_ocr.png'):
        os.remove('test_ocr.png')
