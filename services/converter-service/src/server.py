import os
import sys
import time
import logging
from concurrent import futures
import grpc

# Add src to pythonpath
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, CURRENT_DIR)
sys.path.insert(0, os.path.join(CURRENT_DIR, "generated"))

try:
    from generated import converter_pb2_grpc
except ImportError:
    import converter_pb2_grpc

from services.converter_servicer import FileConverterServicer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(name)s) %(message)s"
)
logger = logging.getLogger("ConverterServer")

# Batas ukuran pesan gRPC (50 MB) agar mendukung file dokumen besar
MAX_MESSAGE_LENGTH = 50 * 1024 * 1024

def serve(port: int = 50051):
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=10),
        options=[
            ('grpc.max_send_message_length', MAX_MESSAGE_LENGTH),
            ('grpc.max_receive_message_length', MAX_MESSAGE_LENGTH),
        ]
    )
    
    converter_pb2_grpc.add_FileConverterServiceServicer_to_server(
        FileConverterServicer(),
        server
    )
    
    bind_address = f"0.0.0.0:{port}"
    server.add_insecure_port(bind_address)
    server.start()
    logger.info(f"🚀 Python Document Converter gRPC Server berjalan di port {port}")
    logger.info(f"   Mendukung: PDF -> DOCX (pdf2docx) & DOCX -> PDF (docx2pdf)")
    
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Menghentikan gRPC Server...")
        server.stop(0)

if __name__ == "__main__":
    port = int(os.environ.get("CONVERTER_GRPC_PORT", 50051))
    serve(port)
