import path from "path";
import { fileURLToPath } from "url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, "../proto/converter.proto");
const GRPC_SERVER_URL = process.env.CONVERTER_GRPC_URL || "127.0.0.1:50051";

// Load Protobuf definition
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const converterPackage = protoDescriptor.converter;

class ConverterGrpcService {
  constructor() {
    this.client = new converterPackage.FileConverterService(
      GRPC_SERVER_URL,
      grpc.credentials.createInsecure(),
      {
        "grpc.max_send_message_length": 50 * 1024 * 1024,
        "grpc.max_receive_message_length": 50 * 1024 * 1024,
      }
    );
  }

  /**
   * Cek kesehatan koneksi gRPC ke microservice Python
   */
  async checkHealth(clientId = "node-backend") {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + 5000);
      this.client.CheckHealth(
        { client_id: clientId },
        { deadline },
        (error, response) => {
          if (error) {
            return reject(error);
          }
          resolve(response);
        }
      );
    });
  }

  /**
   * Ambil daftar format yang didukung secara dinamis
   */
  async getSupportedFormats() {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + 5000);
      this.client.GetSupportedFormats(
        {},
        { deadline },
        (error, response) => {
          if (error) {
            return reject(error);
          }
          resolve(response.sources || []);
        }
      );
    });
  }

  /**
   * Generic Document Converter (fromFormat -> toFormat)
   */
  async convertDocument(fileBuffer, filename, fromFormat, toFormat, options = {}) {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + 120000); // 2 menit timeout
      const requestPayload = {
        filename,
        file_content: fileBuffer,
        from_format: fromFormat.toLowerCase().trim().replace(/^\./, ""),
        to_format: toFormat.toLowerCase().trim().replace(/^\./, ""),
        options: Object.fromEntries(
          Object.entries(options).map(([k, v]) => [k, String(v)])
        ),
      };

      this.client.ConvertDocument(
        requestPayload,
        { deadline },
        (error, response) => {
          if (error) {
            return reject(error);
          }
          if (!response.success) {
            return reject(new Error(response.message || `Gagal mengonversi ${fromFormat} ke ${toFormat}`));
          }
          resolve(response);
        }
      );
    });
  }

  /**
   * Konversi PDF buffer ke DOCX buffer (helper wrapper)
   */
  async convertPdfToDocx(fileBuffer, filename = "document.pdf", options = {}) {
    return this.convertDocument(fileBuffer, filename, "pdf", "docx", options);
  }

  /**
   * Konversi DOCX buffer ke PDF buffer (helper wrapper)
   */
  async convertDocxToPdf(fileBuffer, filename = "document.docx") {
    return this.convertDocument(fileBuffer, filename, "docx", "pdf");
  }
}

export const converterGrpcService = new ConverterGrpcService();
