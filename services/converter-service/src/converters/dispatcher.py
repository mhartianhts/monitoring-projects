import logging
from converters.pdf_to_docx import convert_pdf_to_docx_bytes
from converters.docx_to_pdf import convert_docx_to_pdf_bytes
from converters.md_converters import (
    convert_md_to_pdf_bytes,
    convert_md_to_docx_bytes,
    convert_pdf_to_md_bytes,
    convert_docx_to_md_bytes,
)

logger = logging.getLogger(__name__)

# Definisi matriks format yang didukung beserta metadata label & ekstensinya
SUPPORTED_FORMATS = [
    {
        "format": "pdf",
        "label": "PDF Document",
        "extension": ".pdf",
        "targets": [
            {"format": "docx", "label": "Microsoft Word (.docx)", "extension": ".docx", "description": "Konversi layout presisi ke DOCX"},
            {"format": "md", "label": "Markdown Document (.md)", "extension": ".md", "description": "Ekstraksi teks, heading, dan tabel ke Markdown"}
        ]
    },
    {
        "format": "docx",
        "label": "Microsoft Word (DOCX)",
        "extension": ".docx",
        "targets": [
            {"format": "pdf", "label": "PDF Document (.pdf)", "extension": ".pdf", "description": "Rendering 1:1 identik MS Word"},
            {"format": "md", "label": "Markdown Document (.md)", "extension": ".md", "description": "Ekstraksi struktur dokumen ke Markdown"}
        ]
    },
    {
        "format": "md",
        "label": "Markdown File (.md)",
        "extension": ".md",
        "targets": [
            {"format": "pdf", "label": "PDF Document (.pdf)", "extension": ".pdf", "description": "Render ke PDF dengan tipografi modern"},
            {"format": "docx", "label": "Microsoft Word (.docx)", "extension": ".docx", "description": "Ekspor ke dokumen DOCX berstruktur"}
        ]
    }
]

def get_supported_format_matrix():
    return SUPPORTED_FORMATS

def dispatch_conversion(file_bytes: bytes, filename: str, from_format: str, to_format: str, options: dict = None) -> tuple[bytes, str, int]:
    """
    Dispatcher pusat untuk routing konversi berdasarkan format asal dan tujuan.
    """
    options = options or {}
    src = from_format.lower().strip().lstrip(".")
    dst = to_format.lower().strip().lstrip(".")

    logger.info(f"Dispatching konversi: {filename} ({src} -> {dst})")

    # PDF -> *
    if src == "pdf" and dst == "docx":
        start_page = int(options.get("start_page", 0))
        end_page = int(options.get("end_page", 0))
        return convert_pdf_to_docx_bytes(file_bytes, filename, start_page, end_page)

    if src == "pdf" and dst == "md":
        return convert_pdf_to_md_bytes(file_bytes, filename)

    # DOCX -> *
    if src == "docx" and dst == "pdf":
        return convert_docx_to_pdf_bytes(file_bytes, filename)

    if src == "docx" and dst == "md":
        return convert_docx_to_md_bytes(file_bytes, filename)

    # MD -> *
    if src == "md" and dst == "pdf":
        return convert_md_to_pdf_bytes(file_bytes, filename)

    if src == "md" and dst == "docx":
        return convert_md_to_docx_bytes(file_bytes, filename)

    raise ValueError(f"Kombinasi konversi dari '{src}' ke '{dst}' belum didukung.")
