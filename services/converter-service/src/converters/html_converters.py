import os
import io
import time
import logging
import pymupdf
from xhtml2pdf import pisa
from converters.md_converters import clean_unicode_for_pdf

logger = logging.getLogger(__name__)

# Default CSS style untuk merender dokumen HTML ke PDF dengan tipografi modern & rapi
DEFAULT_PDF_CSS = """
@page {
    size: a4;
    margin: 1.5cm;
}
body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #1e293b;
    margin: 0;
    padding: 0;
}
h1, h2, h3, h4, h5, h6 {
    color: #0f172a;
    font-weight: bold;
    margin-top: 1.2em;
    margin-bottom: 0.5em;
}
h1 { font-size: 18pt; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; }
h2 { font-size: 14pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
h3 { font-size: 12pt; }
h4 { font-size: 11pt; }
p { margin-bottom: 0.8em; }
code {
    font-family: Courier, monospace;
    background-color: #f1f5f9;
    color: #0f172a;
    padding: 2px 4px;
    font-size: 9pt;
}
pre {
    background-color: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 3px solid #3b82f6;
    color: #0f172a;
    padding: 10px 14px;
    font-family: Courier, monospace;
    font-size: 8.5pt;
    line-height: 1.4;
    margin: 1em 0;
}
blockquote {
    border-left: 3px solid #3b82f6;
    padding-left: 12px;
    color: #475569;
    font-style: italic;
    margin: 1em 0;
    background-color: #f8fafc;
    padding: 8px 12px;
}
table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.2em 0;
}
th, td {
    border: 1px solid #cbd5e1;
    padding: 6px 10px;
    text-align: left;
    font-size: 9.5pt;
}
th {
    background-color: #f1f5f9;
    font-weight: bold;
    color: #0f172a;
}
tr:nth-child(even) {
    background-color: #f8fafc;
}
ul, ol {
    margin-bottom: 1em;
    padding-left: 20px;
}
li {
    margin-bottom: 0.3em;
}
img {
    max-width: 100%;
    height: auto;
}
"""

def convert_html_to_pdf_bytes(html_bytes: bytes, filename: str = "document.html", options: dict = None) -> tuple[bytes, str, int]:
    """
    Konversi dokumen HTML (.html, .htm) ke PDF dengan formatting A4 dan tipografi modern via xhtml2pdf.
    Mendukung full HTML document maupun HTML snippets.
    """
import re
import tempfile

def resolve_css_variables(html_text: str) -> str:
    """
    Ekstraksi dan resolusi CSS custom properties (variables) seperti var(--line),
    var(--color, #fallback), dan nested variables agar kompatibel dengan xhtml2pdf.
    """
    # 1. Kumpulkan seluruh deklarasi custom property (--variable-name: value;)
    var_pattern = re.compile(r'(--[a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)')
    variables = {}
    for match in var_pattern.finditer(html_text):
        name = match.group(1).strip()
        val = match.group(2).strip()
        variables[name] = val

    # 2. Resolusi variabel bersarang (nested variables) hingga 5 putaran
    for _ in range(5):
        changed = False
        for k, v in variables.items():
            def replace_var(m):
                var_name = m.group(1).strip()
                fallback = m.group(2).strip() if m.group(2) else ""
                return variables.get(var_name, fallback)
            new_v = re.sub(r'var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)', replace_var, v)
            if new_v != v:
                variables[k] = new_v
                changed = True
        if not changed:
            break

    # 3. Ganti pemanggilan var(--name, fallback) di seluruh dokumen HTML
    def replace_in_html(m):
        name = m.group(1).strip()
        fallback = m.group(2).strip() if m.group(2) else ""
        val = variables.get(name, fallback)
        if not val:
            name_lower = name.lower()
            if any(w in name_lower for w in ["color", "line", "border", "stroke"]):
                return "#cbd5e1"
            if "bg" in name_lower or "background" in name_lower:
                return "#ffffff"
            if "text" in name_lower:
                return "#1e293b"
            return "inherit"
        return val

    result = re.sub(r'var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)', replace_in_html, html_text)

    # 4. Tangani sisa ekspresi var(...) yang mungkin tidak terduga
    def sanitize_leftover_var(m):
        inner = m.group(1).lower()
        if any(w in inner for w in ["color", "line", "border", "stroke"]):
            return "#cbd5e1"
        if "bg" in inner or "background" in inner:
            return "#ffffff"
        return "inherit"

    result = re.sub(r'var\(\s*([^)]+)\s*\)', sanitize_leftover_var, result)
    return result


def _render_html_with_pymupdf_story(html_text: str) -> bytes:
    """
    Fallback rendering engine menggunakan PyMuPDF Story jika xhtml2pdf mengalami
    kendala parsing styling CSS modern.
    """
    story = pymupdf.Story(html_text)
    w, h = pymupdf.paper_size("a4")
    medialen = pymupdf.Rect(0, 0, w, h)
    margin = 42  # ~1.5cm
    rect = pymupdf.Rect(margin, margin, w - margin, h - margin)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        writer = pymupdf.DocumentWriter(tmp_path)
        more = 1
        while more:
            device = writer.begin_page(medialen)
            more, _ = story.place(rect)
            story.draw(device)
            writer.end_page()
        writer.close()

        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def convert_html_to_pdf_bytes(html_bytes: bytes, filename: str = "document.html", options: dict = None) -> tuple[bytes, str, int]:
    """
    Konversi dokumen HTML (.html, .htm) ke PDF dengan formatting A4 dan tipografi modern.
    Mendukung CSS variables, full HTML document, dan HTML snippets dengan automatic fallback engine.
    """
    start_time = time.time()
    base_name = os.path.splitext(filename)[0]
    output_filename = f"{base_name}.pdf"
    logger.info(f"Memulai konversi HTML -> PDF: {filename}")

    html_text = html_bytes.decode("utf-8", errors="replace")
    # Bersihkan karakter box drawing / glyph unicode yang tidak didukung font PDF standar
    html_text = clean_unicode_for_pdf(html_text)
    # Selesaikan pemanggilan CSS variables (var(--line), dsb.) agar kompatibel dengan xhtml2pdf
    html_text = resolve_css_variables(html_text)

    # Deteksi apakah dokumen memiliki tag <html> dan <head>
    lower_text = html_text.lower()
    if "<html" not in lower_text:
        # Dokumen adalah snippet/fragment, bungkus dengan HTML5 template lengkap
        full_html = f"""<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <title>{base_name}</title>
    <style>
{DEFAULT_PDF_CSS}
    </style>
</head>
<body>
{html_text}
</body>
</html>"""
    else:
        # Dokumen HTML lengkap, pastikan @page styling ada jika belum didefinisikan
        if "@page" not in lower_text:
            page_style = "<style>@page { size: a4; margin: 1.5cm; }</style>"
            if "</head>" in html_text:
                full_html = html_text.replace("</head>", f"{page_style}\n</head>", 1)
            else:
                full_html = f"{page_style}\n{html_text}"
        else:
            full_html = html_text

    pdf_bytes = None

    # Percobaan 1: Render dengan xhtml2pdf (pisa)
    try:
        pdf_buffer = io.BytesIO()
        pisa_status = pisa.CreatePDF(
            src=io.StringIO(full_html),
            dest=pdf_buffer,
            encoding="utf-8"
        )
        if not pisa_status.err and len(pdf_buffer.getvalue()) > 0:
            pdf_bytes = pdf_buffer.getvalue()
        else:
            logger.warning(f"xhtml2pdf menghasilkan status error {pisa_status.err}, beralih ke PyMuPDF Story engine.")
    except Exception as e:
        logger.warning(f"xhtml2pdf gagal merender ({e}), beralih ke PyMuPDF Story engine.")

    # Percobaan 2: Fallback ke PyMuPDF Story jika xhtml2pdf gagal
    if pdf_bytes is None or len(pdf_bytes) == 0:
        logger.info(f"Menggunakan engine PyMuPDF Story untuk {filename}...")
        try:
            pdf_bytes = _render_html_with_pymupdf_story(full_html)
        except Exception as e:
            raise RuntimeError(f"Gagal me-render PDF dari HTML (xhtml2pdf & PyMuPDF fallback gagal): {e}")

    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info(f"Konversi HTML -> PDF berhasil: {output_filename} ({len(pdf_bytes)} bytes) dalam {elapsed_ms}ms")
    return pdf_bytes, output_filename, elapsed_ms


def convert_pdf_to_html_bytes(pdf_bytes: bytes, filename: str = "document.pdf", options: dict = None) -> tuple[bytes, str, int]:
    """
    Konversi dokumen PDF ke HTML mandiri (standalone HTML5) menggunakan PyMuPDF.
    Mempertahankan tata letak visual, teks, hierarki heading, dan styling halaman.
    """
    start_time = time.time()
    options = options or {}
    base_name = os.path.splitext(filename)[0]
    output_filename = f"{base_name}.html"
    logger.info(f"Memulai konversi PDF -> HTML: {filename}")

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)

    if total_pages == 0:
        doc.close()
        raise ValueError("Dokumen PDF tidak memiliki halaman.")

    # Evaluasi filter halaman jika opsi diberikan
    start_page = int(options.get("start_page", 0))
    end_page = int(options.get("end_page", 0))

    if start_page < 1:
        start_page = 1
    if end_page < 1 or end_page > total_pages:
        end_page = total_pages
    if start_page > end_page:
        start_page, end_page = 1, total_pages

    pages_html = []
    for page_idx in range(start_page - 1, end_page):
        page = doc[page_idx]
        page_content = page.get_text("html")
        page_number = page_idx + 1
        pages_html.append(f"""
        <!-- Page {page_number} -->
        <div class="pdf-page-wrapper" id="page-wrapper-{page_number}">
            <div class="page-header-badge">Halaman {page_number} dari {total_pages}</div>
            <div class="pdf-page-container">
                {page_content}
            </div>
        </div>
        """)

    doc.close()

    full_document_html = f"""<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{base_name} - Converted Document</title>
    <style>
        :root {{
            --bg-canvas: #f1f5f9;
            --page-bg: #ffffff;
            --shadow-color: rgba(15, 23, 42, 0.08);
            --border-color: #e2e8f0;
            --text-main: #1e293b;
            --badge-bg: #e0e7ff;
            --badge-text: #4338ca;
        }}
        * {{
            box-sizing: border-box;
        }}
        body {{
            margin: 0;
            padding: 30px 15px;
            background-color: var(--bg-canvas);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: var(--text-main);
            display: flex;
            flex-direction: column;
            align-items: center;
        }}
        .top-bar {{
            width: 100%;
            max-width: 860px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #ffffff;
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            box-shadow: 0 2px 4px var(--shadow-color);
        }}
        .top-bar h1 {{
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #0f172a;
        }}
        .top-bar .info {{
            font-size: 13px;
            color: #64748b;
        }}
        .pages-container {{
            display: flex;
            flex-direction: column;
            gap: 28px;
            align-items: center;
            width: 100%;
        }}
        .pdf-page-wrapper {{
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
        }}
        .page-header-badge {{
            align-self: flex-start;
            max-width: 840px;
            margin: 0 auto 6px auto;
            font-size: 11px;
            font-weight: 600;
            color: var(--badge-text);
            background-color: var(--badge-bg);
            padding: 3px 10px;
            border-radius: 9999px;
            letter-spacing: 0.025em;
        }}
        .pdf-page-container {{
            background-color: var(--page-bg);
            border: 1px solid var(--border-color);
            box-shadow: 0 4px 6px -1px var(--shadow-color), 0 2px 4px -2px var(--shadow-color);
            border-radius: 4px;
            overflow: hidden;
            position: relative;
            max-width: 100%;
        }}
        /* PyMuPDF extracted page container adjustment */
        .pdf-page-container > div {{
            position: relative !important;
            margin: 0 auto !important;
            background: transparent !important;
        }}
        @media print {{
            body {{
                background-color: #ffffff;
                padding: 0;
            }}
            .top-bar, .page-header-badge {{
                display: none;
            }}
            .pdf-page-container {{
                border: none;
                box-shadow: none;
                page-break-after: always;
            }}
        }}
    </style>
</head>
<body>
    <div class="top-bar">
        <h1>{base_name}</h1>
        <div class="info">Total {total_pages} Halaman | Dikonversi dari PDF</div>
    </div>
    <div class="pages-container">
        {"".join(pages_html)}
    </div>
</body>
</html>"""

    html_bytes_out = full_document_html.encode("utf-8")
    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info(f"Konversi PDF -> HTML berhasil: {output_filename} ({len(html_bytes_out)} bytes) dalam {elapsed_ms}ms")
    return html_bytes_out, output_filename, elapsed_ms
