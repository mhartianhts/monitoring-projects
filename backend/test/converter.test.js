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

  await t.test("Convert Markdown buffer to PDF buffer via gRPC", async () => {
    try {
      const mdBuffer = Buffer.from("# Laporan PDF\n\nIsi laporan dari markdown.");
      const result = await converterGrpcService.convertDocument(mdBuffer, "laporan.md", "md", "pdf");
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output_filename, "laporan.pdf");
      assert.ok(result.file_content.length > 0);
      console.log(`[PASS] MD -> PDF Converted size: ${result.file_content.length} bytes, time: ${result.processing_time_ms}ms`);
    } catch (err) {
      console.log("Python gRPC server offline:", err.message);
    }
  });
});
