import { Router } from "express";
import multer from "multer";
import { converterController } from "../controllers/converter.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // Maksimal 50 MB
  },
});

export const createConverterRouter = () => {
  const router = Router();

  // Status check & format matrix
  router.get("/status", converterController.getStatus);
  router.get("/formats", converterController.getFormats);

  // Generic Converter (From -> To)
  router.post("/convert", upload.single("file"), converterController.convert);

  // Shortcut endpoints
  router.post("/pdf-to-docx", upload.single("file"), converterController.convertPdfToDocx);
  router.post("/docx-to-pdf", upload.single("file"), converterController.convertDocxToPdf);
  router.post("/html-to-pdf", upload.single("file"), converterController.convertHtmlToPdf);
  router.post("/pdf-to-html", upload.single("file"), converterController.convertPdfToHtml);

  return router;
};
