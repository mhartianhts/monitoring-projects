import os
import io
import time
import logging
import markdown
import markdownify
import mammoth
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from xhtml2pdf import pisa

logger = logging.getLogger(__name__)

# Mapping untuk karakter Unicode Box Drawing & Tree structure agar render sempurna di PDF
UNICODE_REPLACEMENTS = {
    "├──": "|-- ",
    "└──": "\\-- ",
    "├───": "|--- ",
    "└───": "\\--- ",
    "│": "|",
    "─": "-",
    "┌": "+",
    "┐": "+",
    "└": "+",
    "┘": "+",
    "├": "+",
    "┤": "+",
    "┬": "+",
    "┴": "+",
    "┼": "+",
    "►": ">",
    "◄": "<",
    "▲": "^",
    "▼": "v",
    "➔": "->",
    "➜": "->",
    "➝": "->",
    "•": "*",
    "·": "*",
    "…": "...",
    "—": "--",
    "–": "-",
}

# CSS style untuk HTML rendering ke PDF agar hasil PDF terlihat modern, bersih, dan rapi
PDF_CSS_STYLE = """
@page {
    size: a4;
    margin: 2cm;
}
body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #1e293b;
}
h1, h2, h3, h4, h5, h6 {
    color: #0f172a;
    font-weight: bold;
    margin-top: 1.2em;
    margin-bottom: 0.5em;
}
h1 { font-size: 18pt; border-bottom: 2px solid #6366f1; padding-bottom: 6px; }
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
    border-left: 3px solid #6366f1;
    color: #0f172a;
    padding: 10px 14px;
    font-family: Courier, monospace;
    font-size: 8.5pt;
    line-height: 1.4;
    margin: 1em 0;
}
pre code, pre span {
    background-color: transparent !important;
    background: transparent !important;
    color: #0f172a !important;
    padding: 0 !important;
    border: none !important;
}
blockquote {
    border-left: 3px solid #6366f1;
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
hr {
    border: 0;
    height: 1px;
    background: #e2e8f0;
    margin: 2em 0;
}
"""

def clean_unicode_for_pdf(text: str) -> str:
    """Ganti karakter unicode yang tidak didukung font PDF standar (seperti tree structure/box drawing)"""
    for k, v in UNICODE_REPLACEMENTS.items():
        text = text.replace(k, v)
    return text

def convert_md_to_pdf_bytes(md_bytes: bytes, filename: str = "document.md") -> tuple[bytes, str, int]:
    """
    Konversi Markdown (.md) ke PDF beresolusi tinggi dengan stylesheet modern dan clean typography.
    """
    start_time = time.time()
    output_filename = os.path.splitext(filename)[0] + ".pdf"
    logger.info(f"Memulai konversi MD -> PDF: {filename}")

    md_text = md_bytes.decode("utf-8", errors="replace")
    # Bersihkan karakter unicode box/tree agar tidak menghasilkan missing glyph / kotak putih
    md_text = clean_unicode_for_pdf(md_text)

    # Konversi Markdown ke HTML (hindari codehilite yang merusak background span di xhtml2pdf)
    html_content = markdown.markdown(
        md_text,
        extensions=[
            "extra",
            "tables",
            "fenced_code",
            "nl2br",
            "sane_lists"
        ]
    )

    full_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{PDF_CSS_STYLE}</style>
    </head>
    <body>
        {html_content}
    </body>
    </html>
    """

    pdf_buffer = io.BytesIO()
    pisa_status = pisa.CreatePDF(
        src=io.StringIO(full_html),
        dest=pdf_buffer,
        encoding="utf-8"
    )

    if pisa_status.err:
        raise RuntimeError(f"Gagal me-render PDF dari Markdown (pisa error: {pisa_status.err})")

    pdf_bytes = pdf_buffer.getvalue()
    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info(f"Konversi MD -> PDF berhasil: {output_filename} ({len(pdf_bytes)} bytes) dalam {elapsed_ms}ms")
    return pdf_bytes, output_filename, elapsed_ms


def convert_md_to_docx_bytes(md_bytes: bytes, filename: str = "document.md") -> tuple[bytes, str, int]:
    """
    Konversi Markdown (.md) ke DOCX (Word) dengan struktur heading, list, tabel, dan code block.
    """
    start_time = time.time()
    output_filename = os.path.splitext(filename)[0] + ".docx"
    logger.info(f"Memulai konversi MD -> DOCX: {filename}")

    md_text = md_bytes.decode("utf-8", errors="replace")
    doc = Document()

    # Set margins
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    lines = md_text.splitlines()
    in_code_block = False
    code_block_lines = []

    for line in lines:
        stripped = line.strip()

        # Handle Code Blocks ```
        if stripped.startswith("```"):
            if in_code_block:
                # End of code block
                code_text = "\n".join(code_block_lines)
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Inches(0.3)
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(4)
                run = p.add_run(code_text)
                run.font.name = "Consolas"
                run.font.size = Pt(9.5)
                run.font.color.rgb = RGBColor(30, 41, 59)
                code_block_lines = []
                in_code_block = False
            else:
                in_code_block = True
                code_block_lines = []
            continue

        if in_code_block:
            code_block_lines.append(line)
            continue

        if not stripped:
            continue

        # Headings
        if stripped.startswith("# "):
            doc.add_heading(stripped[2:], level=1)
        elif stripped.startswith("## "):
            doc.add_heading(stripped[3:], level=2)
        elif stripped.startswith("### "):
            doc.add_heading(stripped[4:], level=3)
        elif stripped.startswith("#### "):
            doc.add_heading(stripped[5:], level=4)
        # Blockquote
        elif stripped.startswith("> "):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.4)
            run = p.add_run(stripped[2:])
            run.italic = True
            run.font.color.rgb = RGBColor(100, 116, 139)
        # Bullet list
        elif stripped.startswith(("- ", "* ", "+ ")):
            p = doc.add_paragraph(style='List Bullet')
            _add_formatted_text(p, stripped[2:])
        # Numbered list
        elif len(stripped) > 2 and stripped[0].isdigit() and stripped[1] in ('.', ')'):
            p = doc.add_paragraph(style='List Number')
            _add_formatted_text(p, stripped[2:].strip())
        # Horizontal Rule
        elif stripped in ("---", "***", "___"):
            p = doc.add_paragraph()
            run = p.add_run("―" * 40)
            run.font.color.rgb = RGBColor(203, 213, 225)
        # Normal Paragraph
        else:
            p = doc.add_paragraph()
            _add_formatted_text(p, line)

    docx_buffer = io.BytesIO()
    doc.save(docx_buffer)
    docx_bytes = docx_buffer.getvalue()
    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info(f"Konversi MD -> DOCX berhasil: {output_filename} ({len(docx_bytes)} bytes) dalam {elapsed_ms}ms")
    return docx_bytes, output_filename, elapsed_ms


def _add_formatted_text(paragraph, text: str):
    """Helper untuk format bold (**bold**) dan inline code (`code`) sederhana"""
    parts = text.split("**")
    is_bold = False
    for part in parts:
        if part:
            if "`" in part:
                subparts = part.split("`")
                is_code = False
                for sub in subparts:
                    if sub:
                        run = paragraph.add_run(sub)
                        run.bold = is_bold
                        if is_code:
                            run.font.name = "Consolas"
                            run.font.size = Pt(9.5)
                            run.font.color.rgb = RGBColor(225, 29, 72)
                    is_code = not is_code
            else:
                run = paragraph.add_run(part)
                run.bold = is_bold
        is_bold = not is_bold


def convert_pdf_to_md_bytes(pdf_bytes: bytes, filename: str = "document.pdf") -> tuple[bytes, str, int]:
    """
    Konversi PDF ke Markdown berstruktur (headings, lists, tables) menggunakan pymupdf4llm / PyMuPDF.
    """
    start_time = time.time()
    output_filename = os.path.splitext(filename)[0] + ".md"
    logger.info(f"Memulai konversi PDF -> MD: {filename}")

    try:
        import pymupdf4llm
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        md_text = pymupdf4llm.to_markdown(doc)
        doc.close()
    except Exception as e:
        logger.warning(f"pymupdf4llm gagal, fallback ke fitz text extraction: {e}")
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_text = []
        for page_num, page in enumerate(doc, 1):
            pages_text.append(f"## Halaman {page_num}\n\n" + page.get_text())
        doc.close()
        md_text = "\n\n---\n\n".join(pages_text)

    md_bytes_out = md_text.encode("utf-8")
    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info(f"Konversi PDF -> MD berhasil: {output_filename} ({len(md_bytes_out)} bytes) dalam {elapsed_ms}ms")
    return md_bytes_out, output_filename, elapsed_ms


def convert_docx_to_md_bytes(docx_bytes: bytes, filename: str = "document.docx") -> tuple[bytes, str, int]:
    """
    Konversi DOCX ke Markdown menggunakan mammoth HTML converter + markdownify.
    """
    start_time = time.time()
    output_filename = os.path.splitext(filename)[0] + ".md"
    logger.info(f"Memulai konversi DOCX -> MD: {filename}")

    docx_file = io.BytesIO(docx_bytes)
    result = mammoth.convert_to_html(docx_file)
    html_text = result.value

    # Convert HTML to clean markdown
    md_text = markdownify.markdownify(
        html_text,
        heading_style="ATX",
        bullets_style="-",
        code_language="python"
    ).strip()

    md_bytes_out = md_text.encode("utf-8")
    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info(f"Konversi DOCX -> MD berhasil: {output_filename} ({len(md_bytes_out)} bytes) dalam {elapsed_ms}ms")
    return md_bytes_out, output_filename, elapsed_ms
