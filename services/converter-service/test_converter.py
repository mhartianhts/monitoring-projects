import os
import sys
import unittest
from io import BytesIO

# Add src to pythonpath
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from converters.dispatcher import dispatch_conversion, get_supported_format_matrix

SAMPLE_MD = b"""# Judul Dokumen Pengujian

Ini adalah paragraf pengantar dengan format **teks tebal**, *teks miring*, dan `inline code`.

## Daftar Fitur
- Fitur Konversi PDF ke DOCX
- Fitur Konversi DOCX ke PDF
- Fitur Konversi Markdown ke PDF dan DOCX

## Contoh Kode
```python
def halo_dunia():
    print("Microservice gRPC Python Berjalan!")
```

> Catatan: Konversi ini mempertahankan format tabel dan heading.

| No | Format Asal | Format Tujuan | Status |
|---|---|---|---|
| 1 | PDF | DOCX | OK |
| 2 | MD | PDF | OK |
| 3 | MD | DOCX | OK |
"""

class TestConverterMultiFormat(unittest.TestCase):

    def test_format_matrix(self):
        matrix = get_supported_format_matrix()
        self.assertTrue(len(matrix) >= 3)
        sources = [m["format"] for m in matrix]
        self.assertIn("pdf", sources)
        self.assertIn("docx", sources)
        self.assertIn("md", sources)
        print("\n[PASS] Format matrix valid:", sources)

    def test_md_to_pdf(self):
        pdf_bytes, out_name, elapsed = dispatch_conversion(
            SAMPLE_MD, "panduan.md", "md", "pdf"
        )
        self.assertTrue(len(pdf_bytes) > 0)
        self.assertEqual(out_name, "panduan.pdf")
        print(f"[PASS] MD -> PDF Berhasil: {out_name} ({len(pdf_bytes)} bytes) dalam {elapsed}ms")

    def test_md_to_docx(self):
        docx_bytes, out_name, elapsed = dispatch_conversion(
            SAMPLE_MD, "panduan.md", "md", "docx"
        )
        self.assertTrue(len(docx_bytes) > 0)
        self.assertEqual(out_name, "panduan.docx")
        print(f"[PASS] MD -> DOCX Berhasil: {out_name} ({len(docx_bytes)} bytes) dalam {elapsed}ms")

if __name__ == "__main__":
    unittest.main()
