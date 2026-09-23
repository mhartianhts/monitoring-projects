import { converterGrpcService } from "../services/converterGrpc.service.js";
import { ok, fail } from "../utils/response.js";

const MIME_MAP = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
};

/**
 * Controller untuk menangani konversi dokumen dinamis via gRPC microservice
 */
export const converterController = {
  /**
   * Health status microservice
   */
  async getStatus(_req, res) {
    try {
      const health = await converterGrpcService.checkHealth();
      return ok(res, {
        connected: true,
        grpcService: health,
      });
    } catch (err) {
      return ok(res, {
        connected: false,
        message: "Microservice Python gRPC tidak dapat dijangkau. Pastikan server python berjalan di port 50051.",
        error: err.message,
      });
    }
  },

  /**
   * Ambil daftar format yang didukung secara dinamis
   */
  async getFormats(_req, res) {
    try {
      const formats = await converterGrpcService.getSupportedFormats();
      return ok(res, formats);
    } catch (err) {
      // Fallback matrix jika microservice offline
      return ok(res, [
        {
          format: "pdf",
          label: "PDF Document",
          extension: ".pdf",
          targets: [
            { format: "docx", label: "Microsoft Word (.docx)", extension: ".docx", description: "Konversi layout presisi ke DOCX" },
            { format: "md", label: "Markdown Document (.md)", extension: ".md", description: "Ekstraksi teks dan tabel ke Markdown" },
            { format: "html", label: "HTML Webpage (.html)", extension: ".html", description: "Ekstraksi visual & teks ke dokumen web interaktif" },
          ],
        },
        {
          format: "docx",
          label: "Microsoft Word (DOCX)",
          extension: ".docx",
          targets: [
            { format: "pdf", label: "PDF Document (.pdf)", extension: ".pdf", description: "Rendering 1:1 identik MS Word" },
            { format: "md", label: "Markdown Document (.md)", extension: ".md", description: "Ekstraksi struktur dokumen ke Markdown" },
          ],
        },
        {
          format: "md",
          label: "Markdown File (.md)",
          extension: ".md",
          targets: [
            { format: "pdf", label: "PDF Document (.pdf)", extension: ".pdf", description: "Render ke PDF dengan tipografi modern" },
            { format: "docx", label: "Microsoft Word (.docx)", extension: ".docx", description: "Ekspor ke dokumen DOCX berstruktur" },
          ],
        },
        {
          format: "html",
          label: "HTML Document (.html)",
          extension: ".html",
          targets: [
            { format: "pdf", label: "PDF Document (.pdf)", extension: ".pdf", description: "Render ke PDF siap cetak dengan tipografi modern" },
          ],
        },
      ]);
    }
  },

  /**
   * Endpoint Konversi Dinamis (From -> To)
   */
  async convert(req, res) {
    try {
      if (!req.file) {
        return fail(res, "File dokumen wajib diunggah", 400);
      }

      const fromFormat = (req.body.fromFormat || "").toLowerCase().trim().replace(/^\./, "");
      const toFormat = (req.body.toFormat || "").toLowerCase().trim().replace(/^\./, "");

      if (!fromFormat || !toFormat) {
        return fail(res, "Parameter fromFormat dan toFormat wajib diisi", 400);
      }

      const originalName = req.file.originalname || `document.${fromFormat}`;
      const options = {
        start_page: req.body.startPage || "0",
        end_page: req.body.endPage || "0",
      };

      const result = await converterGrpcService.convertDocument(
        req.file.buffer,
        originalName,
        fromFormat,
        toFormat,
        options
      );

      const outputFilename = result.output_filename || originalName.replace(/\.[^/.]+$/, `.${toFormat}`);
      const contentType = MIME_MAP[toFormat] || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(outputFilename)}"`);
      res.setHeader("X-Processing-Time-Ms", String(result.processing_time_ms || 0));
      return res.send(Buffer.from(result.file_content));
    } catch (err) {
      return fail(res, `Konversi dokumen gagal: ${err.message}`, 500);
    }
  },

  /**
   * Endpoint Konversi PDF ke DOCX (Legacy / Quick route)
   */
  async convertPdfToDocx(req, res) {
    req.body.fromFormat = "pdf";
    req.body.toFormat = "docx";
    return converterController.convert(req, res);
  },

  /**
   * Endpoint Konversi DOCX ke PDF (Legacy / Quick route)
   */
  async convertDocxToPdf(req, res) {
    req.body.fromFormat = "docx";
    req.body.toFormat = "pdf";
    return converterController.convert(req, res);
  },

  /**
   * Endpoint Konversi HTML ke PDF (Quick route)
   */
  async convertHtmlToPdf(req, res) {
    req.body.fromFormat = "html";
    req.body.toFormat = "pdf";
    return converterController.convert(req, res);
  },

  /**
   * Endpoint Konversi PDF ke HTML (Quick route)
   */
  async convertPdfToHtml(req, res) {
    req.body.fromFormat = "pdf";
    req.body.toFormat = "html";
    return converterController.convert(req, res);
  },
};
