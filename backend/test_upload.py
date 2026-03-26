import requests
import io
from PIL import Image, ImageDraw

def create_test_pdf():
    # Create a test image with Italian legal text
    img = Image.new('RGB', (800, 200), color = (255, 255, 255))
    d = ImageDraw.Draw(img)
    text = "CONTRATTO DI MUTUO IPOTECARIO\nTRA LE PARTI: Mario Rossi e Banca Intesa...\nData: 21 Marzo 2026."
    d.text((50, 50), text, fill=(0,0,0))
    
    # Save as PDF
    pdf_bytes = io.BytesIO()
    img.save(pdf_bytes, "PDF", resolution=100.0)
    pdf_bytes.seek(0)
    return pdf_bytes

def test_upload():
    print("Creating test PDF...")
    pdf_file = create_test_pdf()
    
    print("Uploading to API...")
    files = {'file': ('test_document.pdf', pdf_file, 'application/pdf')}
    response = requests.post("http://localhost:8000/api/upload", files=files)
    
    if response.status_code == 200:
        data = response.json()
        doc_id = data["document_id"]
        print(f"Upload successful. Document ID: {doc_id}")
        return doc_id
    else:
        print(f"Upload failed: {response.status_code} - {response.text}")
        return None

if __name__ == "__main__":
    test_upload()
