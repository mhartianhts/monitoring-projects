import os
import tempfile
import time
import logging
from pdf2docx import Converter

logger = logging.getLogger(__name__)

def convert_pdf_to_docx_bytes(pdf_bytes: bytes, filename: str = "document.pdf", start_page: int = 0, end_page: int = 0) -> tuple[bytes, str, int]:
    """
    Konversi binary PDF bytes menjadi binary DOCX bytes menggunakan pdf2docx.
    Menggunakan algoritma analisis layout berbasis rule untuk mempertahankan struktur,
    tabel, multi-kolom, font, dan gambar.
    """
    start_time = time.time()
    temp_dir = tempfile.mkdtemp(prefix="pdf2docx_")
    input_path = os.path.join(temp_dir, "input.pdf")
    output_filename = os.path.splitext(filename)[0] + ".docx"
    output_path = os.path.join(temp_dir, "output.docx")

    try:
        with open(input_path, "wb") as f:
            f.write(pdf_bytes)

        logger.info(f"Memulai konversi PDF -> DOCX: {filename} ({len(pdf_bytes)} bytes)")
        
        cv = Converter(input_path)
        try:
            if start_page > 0 or end_page > 0:
                cv.convert(output_path, start=start_page, end=end_page if end_page > 0 else None)
            else:
                cv.convert(output_path)
        finally:
            cv.close()

        if not os.path.exists(output_path):
            raise RuntimeError(f"Gagal menghasilkan file DOCX untuk {filename}")

        with open(output_path, "rb") as f:
            docx_bytes = f.read()

        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.info(f"Konversi berhasil: {output_filename} ({len(docx_bytes)} bytes) dalam {elapsed_ms}ms")
        return docx_bytes, output_filename, elapsed_ms

    finally:
        # Bersihkan temporary files
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
            if os.path.exists(output_path):
                os.remove(output_path)
            if os.path.exists(temp_dir):
                os.rmdir(temp_dir)
        except Exception as cleanup_err:
            logger.warning(f"Gagal membersihkan temp dir {temp_dir}: {cleanup_err}")
