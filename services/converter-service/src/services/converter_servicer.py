import logging
import time
import sys
import os

# Menambahkan path src/generated ke sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "generated")))

try:
    from generated import converter_pb2, converter_pb2_grpc
except ImportError:
    import converter_pb2
    import converter_pb2_grpc

from converters.dispatcher import dispatch_conversion, get_supported_format_matrix

logger = logging.getLogger(__name__)

class FileConverterServicer(converter_pb2_grpc.FileConverterServiceServicer):
    """
    Implementasi gRPC Servicer untuk penanganan RPC konversi dokumen multi-format.
    """

    def CheckHealth(self, request, context):
        return converter_pb2.HealthResponse(
            is_healthy=True,
            version="1.1.0",
            message="Converter microservice is running and healthy with multi-format engine"
        )

    def GetSupportedFormats(self, request, context):
        matrix = get_supported_format_matrix()
        sources_proto = []
        for src in matrix:
            targets_proto = [
                converter_pb2.FormatTarget(
                    format=t["format"],
                    label=t["label"],
                    extension=t["extension"],
                    description=t["description"]
                ) for t in src["targets"]
            ]
            sources_proto.append(converter_pb2.FormatSource(
                format=src["format"],
                label=src["label"],
                extension=src["extension"],
                targets=targets_proto
            ))
        return converter_pb2.FormatListResponse(sources=sources_proto)

    def ConvertDocument(self, request, context):
        filename = request.filename or f"document.{request.from_format}"
        file_bytes = request.file_content
        from_format = request.from_format or "pdf"
        to_format = request.to_format or "docx"
        options = dict(request.options)

        logger.info(f"gRPC ConvertDocument: {filename} [{from_format} -> {to_format}] ({len(file_bytes)} bytes)")

        if not file_bytes:
            context.set_code(context.code.INVALID_ARGUMENT)
            context.set_details("File content cannot be empty")
            return converter_pb2.ConvertResponse(
                success=False,
                message="File content cannot be empty",
                output_filename="",
                file_content=b"",
                processing_time_ms=0
            )

        try:
            converted_bytes, output_filename, elapsed_ms = dispatch_conversion(
                file_bytes=file_bytes,
                filename=filename,
                from_format=from_format,
                to_format=to_format,
                options=options
            )
            return converter_pb2.ConvertResponse(
                success=True,
                message=f"Document successfully converted from {from_format.upper()} to {to_format.upper()}",
                output_filename=output_filename,
                file_content=converted_bytes,
                processing_time_ms=elapsed_ms
            )
        except Exception as e:
            logger.exception(f"Gagal memproses ConvertDocument ({from_format} -> {to_format}): {e}")
            return converter_pb2.ConvertResponse(
                success=False,
                message=f"Conversion error: {str(e)}",
                output_filename="",
                file_content=b"",
                processing_time_ms=0
            )

    def ConvertPdfToDocx(self, request, context):
        options = {}
        if request.start_page:
            options["start_page"] = str(request.start_page)
        if request.end_page:
            options["end_page"] = str(request.end_page)

        doc_req = converter_pb2.ConvertDocumentRequest(
            filename=request.filename,
            file_content=request.file_content,
            from_format="pdf",
            to_format="docx",
            options=options
        )
        return self.ConvertDocument(doc_req, context)

    def ConvertDocxToPdf(self, request, context):
        doc_req = converter_pb2.ConvertDocumentRequest(
            filename=request.filename,
            file_content=request.file_content,
            from_format="docx",
            to_format="pdf",
            options={}
        )
        return self.ConvertDocument(doc_req, context)
