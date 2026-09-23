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

SAMPLE_HTML = b"""<!DOCTYPE html>
<html>
<head>
    <title>Laporan Desain Sistem</title>
    <style>
        h1 { color: #2563eb; }
        p { font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #94a3b8; padding: 6px; }
    </style>
</head>
<body>
    <h1>Laporan Pengujian HTML</h1>
    <p>Ini adalah dokumen pengujian konversi HTML ke PDF.</p>
    <table>
        <tr><th>Modul</th><th>Status</th></tr>
        <tr><td>HTML to PDF</td><td>Siap</td></tr>
        <tr><td>PDF to HTML</td><td>Siap</td></tr>
    </table>
</body>
</html>"""

class TestConverterMultiFormat(unittest.TestCase):

    def test_format_matrix(self):
        matrix = get_supported_format_matrix()
        self.assertTrue(len(matrix) >= 4)
        sources = [m["format"] for m in matrix]
        self.assertIn("pdf", sources)
        self.assertIn("docx", sources)
        self.assertIn("md", sources)
        self.assertIn("html", sources)

        # Periksa target html di source pdf
        pdf_source = next(m for m in matrix if m["format"] == "pdf")
        pdf_targets = [t["format"] for t in pdf_source["targets"]]
        self.assertIn("html", pdf_targets)

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

    def test_html_to_pdf(self):
        pdf_bytes, out_name, elapsed = dispatch_conversion(
            SAMPLE_HTML, "laporan.html", "html", "pdf"
        )
        self.assertTrue(len(pdf_bytes) > 0)
        self.assertEqual(out_name, "laporan.pdf")
        print(f"[PASS] HTML -> PDF Berhasil: {out_name} ({len(pdf_bytes)} bytes) dalam {elapsed}ms")

    def test_pdf_to_html(self):
        # Konversi sample HTML ke PDF terlebih dahulu untuk mendapatkan valid PDF bytes
        pdf_bytes, _, _ = dispatch_conversion(SAMPLE_HTML, "dokumen.html", "html", "pdf")
        html_bytes, out_name, elapsed = dispatch_conversion(
            pdf_bytes, "dokumen.pdf", "pdf", "html"
        )
        self.assertTrue(len(html_bytes) > 0)
        self.assertEqual(out_name, "dokumen.html")
        html_str = html_bytes.decode("utf-8")
        self.assertIn("<!DOCTYPE html>", html_str)
        self.assertIn("Laporan Pengujian HTML", html_str)
        print(f"[PASS] PDF -> HTML Berhasil: {out_name} ({len(html_bytes)} bytes) dalam {elapsed}ms")

    def test_html_with_css_variables_to_pdf(self):
        html_with_vars = b"""<!DOCTYPE html>
<html>
<head>
    <style>
        :root {
            --line: #e2e8f0;
            --primary: #3b82f6;
            --bg-card: #f8fafc;
        }
        .card {
            border: 1px solid var(--line);
            color: var(--primary);
            background-color: var(--bg-card);
            border-bottom: 2px solid var(--undefined-color, #64748b);
        }
    </style>
</head>
<body>
    <div class="card">Dokumen dengan CSS custom properties var(--line)</div>
</body>
</html>"""
        pdf_bytes, out_name, elapsed = dispatch_conversion(
            html_with_vars, "css_vars.html", "html", "pdf"
        )
        self.assertTrue(len(pdf_bytes) > 0)
        self.assertEqual(out_name, "css_vars.pdf")
        print(f"[PASS] HTML with CSS vars (var(--line)) -> PDF Berhasil: {out_name} ({len(pdf_bytes)} bytes) dalam {elapsed}ms")

if __name__ == "__main__":
    unittest.main()

