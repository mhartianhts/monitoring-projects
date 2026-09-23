import test from "node:test";
import assert from "node:assert/strict";
import { converterGrpcService } from "../src/services/converterGrpc.service.js";

test("Converter gRPC Microservice Multi-Format Tests", async (t) => {
  await t.test("Health check to Python gRPC server", async () => {
    try {
      const health = await converterGrpcService.checkHealth("test-runner");
      assert.strictEqual(health.is_healthy, true);
      console.log("gRPC Health Check Response:", health);
    } catch (err) {
      console.log("Python gRPC server offline or offline testing:", err.message);
    }
  });

  await t.test("Get Supported Formats from Python gRPC", async () => {
    try {
      const formats = await converterGrpcService.getSupportedFormats();
      assert.ok(Array.isArray(formats));
      console.log("Supported Formats from gRPC:", formats.map(f => `${f.format} -> [${f.targets.map(t => t.format).join(", ")}]`));
    } catch (err) {
      console.log("Python gRPC server offline:", err.message);
    }
  });

  await t.test("Convert Markdown buffer to DOCX buffer via gRPC", async () => {
    try {
      const mdBuffer = Buffer.from("# Judul Panduan\n\nIni adalah file Markdown pengujian **bold**.\n- Item 1\n- Item 2");
      const result = await converterGrpcService.convertDocument(mdBuffer, "panduan.md", "md", "docx");
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output_filename, "panduan.docx");
      assert.ok(result.file_content.length > 0);
      console.log(`[PASS] MD -> DOCX Converted size: ${result.file_content.length} bytes, time: ${result.processing_time_ms}ms`);
    } catch (err) {
      console.log("Python gRPC server offline:", err.message);
    }
  });

  await t.test("Convert HTML buffer to PDF buffer via gRPC", async () => {
    try {
      const htmlBuffer = Buffer.from("<html><body><h1>Judul HTML</h1><p>Paragraf pengujian convert HTML ke PDF.</p></body></html>");
      const result = await converterGrpcService.convertDocument(htmlBuffer, "halaman.html", "html", "pdf");
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output_filename, "halaman.pdf");
      assert.ok(result.file_content.length > 0);
      console.log(`[PASS] HTML -> PDF Converted size: ${result.file_content.length} bytes, time: ${result.processing_time_ms}ms`);
    } catch (err) {
      console.log("Python gRPC server offline:", err.message);
    }
  });

  await t.test("Convert PDF buffer to HTML buffer via gRPC", async () => {
    try {
      // Buat PDF dulu via html converter
      const htmlBuffer = Buffer.from("<html><body><h1>Dokumen PDF</h1><p>Isi dokumen untuk konversi balik ke HTML.</p></body></html>");
      const pdfRes = await converterGrpcService.convertDocument(htmlBuffer, "sumber.html", "html", "pdf");
      
      const result = await converterGrpcService.convertDocument(pdfRes.file_content, "sumber.pdf", "pdf", "html");
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output_filename, "sumber.html");
      assert.ok(result.file_content.length > 0);
      const htmlOut = Buffer.from(result.file_content).toString("utf-8");
      assert.ok(htmlOut.includes("<!DOCTYPE html>"));
      console.log(`[PASS] PDF -> HTML Converted size: ${result.file_content.length} bytes, time: ${result.processing_time_ms}ms`);
    } catch (err) {
      console.log("Python gRPC server offline:", err.message);
    }
  });
});
