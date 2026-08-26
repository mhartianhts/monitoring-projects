import os
import sys
import tempfile
import time
import logging
import subprocess

logger = logging.getLogger(__name__)

def convert_docx_to_pdf_bytes(docx_bytes: bytes, filename: str = "document.docx") -> tuple[bytes, str, int]:
    """
    Konversi binary DOCX bytes menjadi binary PDF bytes.
    Pada Windows: Menggunakan docx2pdf (Native Word COM) untuk hasil 1:1 identik.
    Fallback: Mencoba LibreOffice headless jika Word tidak terpasang.
    """
    start_time = time.time()
    temp_dir = tempfile.mkdtemp(prefix="docx2pdf_")
    input_path = os.path.join(temp_dir, "input.docx")
    output_filename = os.path.splitext(filename)[0] + ".pdf"
    output_path = os.path.join(temp_dir, "output.pdf")

    try:
        with open(input_path, "wb") as f:
            f.write(docx_bytes)

        logger.info(f"Memulai konversi DOCX -> PDF: {filename} ({len(docx_bytes)} bytes)")
        
        conversion_success = False
        last_error = None

        # Strategi 1: docx2pdf (MS Word COM di Windows)
        try:
            # Penting: Inisialisasi COM di multithreaded environment (gRPC worker threads)
            if sys.platform == "win32":
                try:
                    import pythoncom
                    pythoncom.CoInitialize()
                except Exception as com_init_err:
                    logger.debug(f"pythoncom.CoInitialize notice: {com_init_err}")

            from docx2pdf import convert
            convert(input_path, output_path)
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                conversion_success = True
        except Exception as e:
            last_error = e
            logger.warning(f"Metode docx2pdf gagal: {e}. Mencoba fallback alternatif...")

        # Strategi 2: Fallback ke LibreOffice / soffice jika tersedia
        if not conversion_success:
            libreoffice_paths = [
                "soffice",
                "libreoffice",
                r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"
            ]
            
            for lo_cmd in libreoffice_paths:
                try:
                    cmd = [lo_cmd, "--headless", "--convert-to", "pdf", "--outdir", temp_dir, input_path]
                    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
                    gen_pdf = os.path.join(temp_dir, "input.pdf")
                    if os.path.exists(gen_pdf):
                        if os.path.exists(output_path):
                            os.remove(output_path)
                        os.rename(gen_pdf, output_path)
                        conversion_success = True
                        break
                except Exception as lo_err:
                    continue

        if not conversion_success or not os.path.exists(output_path):
            error_msg = f"Gagal mengonversi DOCX ke PDF. Pastikan Microsoft Word atau LibreOffice terpasang di sistem. Detail: {last_error}"
            logger.error(error_msg)
            raise RuntimeError(error_msg)

        with open(output_path, "rb") as f:
            pdf_bytes = f.read()

        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.info(f"Konversi DOCX -> PDF berhasil: {output_filename} ({len(pdf_bytes)} bytes) dalam {elapsed_ms}ms")
        return pdf_bytes, output_filename, elapsed_ms

    finally:
        if sys.platform == "win32":
            try:
                import pythoncom
                pythoncom.CoUninitialize()
            except Exception:
                pass

        # Bersihkan temporary files
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
            if os.path.exists(output_path):
                os.remove(output_path)
            if os.path.exists(temp_dir):
                for left_file in os.listdir(temp_dir):
                    try:
                        os.remove(os.path.join(temp_dir, left_file))
                    except Exception:
                        pass
                os.rmdir(temp_dir)
        except Exception as cleanup_err:
            logger.warning(f"Gagal membersihkan temp dir {temp_dir}: {cleanup_err}")
