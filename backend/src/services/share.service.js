import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { appConfig } from "../config/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED_DIR = path.resolve(__dirname, "../../data/shared-files");
const META_FILE = path.resolve(__dirname, "../../data/shared-files-meta.json");
const TEXTS_FILE = path.resolve(__dirname, "../../data/shared-texts.json");

// Ensure directories exist
if (!fs.existsSync(SHARED_DIR)) {
  fs.mkdirSync(SHARED_DIR, { recursive: true });
}

export class ShareService {
  constructor(io = null) {
    this.io = io;
  }

  setIo(io) {
    this.io = io;
  }

  getNetworkInterfaces() {
    const interfaces = os.networkInterfaces();
    const results = [];

    for (const [name, nets] of Object.entries(interfaces)) {
      if (!nets) continue;
      for (const net of nets) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        if (net.family === "IPv4" && !net.internal) {
          // Identify probable Wi-Fi / Ethernet adapters
          const isWifi = /wi-?fi|wlan|wireless/i.test(name);
          const isEthernet = /ethernet|eth|lan/i.test(name);
          results.push({
            name,
            ip: net.address,
            netmask: net.netmask,
            isWifi,
            isEthernet,
          });
        }
      }
    }

    // Sort so Wi-Fi / Ethernet are preferred first
    results.sort((a, b) => {
      if (a.isWifi && !b.isWifi) return -1;
      if (!a.isWifi && b.isWifi) return 1;
      if (a.isEthernet && !b.isEthernet) return -1;
      if (!a.isEthernet && b.isEthernet) return 1;
      return 0;
    });

    return results;
  }

  getPrimaryIp() {
    const interfaces = this.getNetworkInterfaces();
    return interfaces.length > 0 ? interfaces[0].ip : "127.0.0.1";
  }

  async getShareInfo(customIp = null) {
    const interfaces = this.getNetworkInterfaces();
    const ip = customIp || (interfaces.length > 0 ? interfaces[0].ip : "127.0.0.1");
    
    // Determine frontend port from config (e.g. 7070)
    let frontendPort = 7070;
    try {
      const url = new URL(appConfig.frontendOrigin);
      frontendPort = Number(url.port) || 7070;
    } catch {
      frontendPort = 7070;
    }

    const shareUrl = `http://${ip}:${frontendPort}/mobile-share`;
    const backendApiUrl = `http://${ip}:${appConfig.port}/api`;

    let qrCodeDataUrl = "";
    try {
      qrCodeDataUrl = await QRCode.toDataURL(shareUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
    } catch (err) {
      console.error("QR Code generation error:", err);
    }

    return {
      selectedIp: ip,
      interfaces,
      shareUrl,
      backendApiUrl,
      backendPort: appConfig.port,
      frontendPort,
      qrCodeDataUrl,
    };
  }

  _readMetadata() {
    try {
      if (fs.existsSync(META_FILE)) {
        return JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
      }
    } catch (err) {
      console.error("Error reading file metadata:", err);
    }
    return [];
  }

  _writeMetadata(data) {
    try {
      fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error writing file metadata:", err);
    }
  }

  _readTexts() {
    try {
      if (fs.existsSync(TEXTS_FILE)) {
        return JSON.parse(fs.readFileSync(TEXTS_FILE, "utf-8"));
      }
    } catch (err) {
      console.error("Error reading texts:", err);
    }
    return [];
  }

  _writeTexts(data) {
    try {
      fs.writeFileSync(TEXTS_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error writing texts:", err);
    }
  }

  listSharedFiles() {
    const metaList = this._readMetadata();
    // Validate that files actually exist on disk
    const validList = metaList.filter((item) => {
      const filePath = path.join(SHARED_DIR, item.storedFilename);
      return fs.existsSync(filePath);
    });

    if (validList.length !== metaList.length) {
      this._writeMetadata(validList);
    }

    return validList;
  }

  saveSharedFile(file, sender = "PC") {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const ext = path.extname(file.originalname);
    const storedFilename = `${id}${ext}`;
    const destinationPath = path.join(SHARED_DIR, storedFilename);

    try {
      fs.copyFileSync(file.path, destinationPath);
      fs.unlinkSync(file.path);
    } catch (err) {
      // Fallback rename if copy fails
      fs.renameSync(file.path, destinationPath);
    }

    const fileMeta = {
      id,
      name: file.originalname,
      storedFilename,
      size: file.size,
      mimeType: file.mimetype,
      sender,
      uploadedAt: new Date().toISOString(),
    };

    const list = this._readMetadata();
    list.unshift(fileMeta);
    this._writeMetadata(list);

    this._notifyUpdate("file_uploaded", fileMeta);
    return fileMeta;
  }

  getFile(fileId) {
    const list = this._readMetadata();
    const item = list.find((f) => f.id === fileId);
    if (!item) return null;

    const filePath = path.join(SHARED_DIR, item.storedFilename);
    if (!fs.existsSync(filePath)) return null;

    return {
      meta: item,
      filePath,
    };
  }

  deleteSharedFile(fileId) {
    const list = this._readMetadata();
    const itemIndex = list.findIndex((f) => f.id === fileId);
    if (itemIndex === -1) return false;

    const item = list[itemIndex];
    const filePath = path.join(SHARED_DIR, item.storedFilename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error("Error deleting file:", err);
      }
    }

    list.splice(itemIndex, 1);
    this._writeMetadata(list);

    this._notifyUpdate("file_deleted", { id: fileId });
    return true;
  }

  listSharedTexts() {
    return this._readTexts();
  }

  addSharedText(content, sender = "PC") {
    if (!content || typeof content !== "string" || !content.trim()) {
      throw new Error("Teks tidak boleh kosong");
    }

    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
      content: content.trim(),
      sender,
      createdAt: new Date().toISOString(),
    };

    const texts = this._readTexts();
    texts.unshift(item);
    // Keep max 50 recent texts
    if (texts.length > 50) {
      texts.length = 50;
    }
    this._writeTexts(texts);

    this._notifyUpdate("text_added", item);
    return item;
  }

  deleteSharedText(id) {
    const texts = this._readTexts();
    const newTexts = texts.filter((t) => t.id !== id);
    if (newTexts.length === texts.length) return false;

    this._writeTexts(newTexts);
    this._notifyUpdate("text_deleted", { id });
    return true;
  }

  _notifyUpdate(type, data) {
    if (this.io) {
      this.io.emit("share:update", { type, data, timestamp: Date.now() });
    }
  }
}

export const shareService = new ShareService();
