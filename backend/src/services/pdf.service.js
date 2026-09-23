import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DOCS_DIR = path.resolve(__dirname, "../../data/docs");

export const getProjectDocsDir = (projectId) => {
  const safeProjectId = String(projectId || "default").replace(/[^a-zA-Z0-9_\-]/g, "_");
  const dir = path.join(DEFAULT_DOCS_DIR, safeProjectId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

export const getProjectScreenshotsDir = (projectId) => {
  const projectDocsDir = getProjectDocsDir(projectId);
  const dir = path.join(projectDocsDir, "screenshots");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

/**
 * Clean inline markdown bold/italic/code markers for simple text rendering
 */
const stripInlineMarkdown = (text) => {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1");
};

/**
 * Converts a Markdown string into a styled PDF document using PDFKit.
 * Returns a Promise<Buffer> containing the generated PDF data.
 * 
 * @param {Object} options
 * @param {string} options.title - Document Title (e.g., "Dokumentasi Teknikal")
 * @param {string} options.subtitle - Subtitle / Branch name
 * @param {string} options.markdown - Raw Markdown content from AI
 * @param {string} [options.projectName] - Project Name
 * @returns {Promise<Buffer>}
 */
export const createPdfFromMarkdown = ({ title, subtitle, markdown, projectName = "" }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        bufferPages: true,
        size: "A4",
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Header Brand Banner
      doc
        .rect(50, 45, 495, 3)
        .fill("#2563eb");

      doc
        .fillColor("#1e293b")
        .fontSize(22)
        .font("Helvetica-Bold")
        .text(title, 50, 60);

      const metaParts = [];
      if (projectName) metaParts.push(`Project: ${projectName}`);
      if (subtitle) metaParts.push(`Branch: ${subtitle}`);
      metaParts.push(`Tanggal: ${new Date().toLocaleDateString("id-ID", { dateStyle: "medium" })}`);

      doc
        .fillColor("#64748b")
        .fontSize(9)
        .font("Helvetica")
        .text(metaParts.join("   |   "), 50, 90);

      doc
        .rect(50, 105, 495, 0.5)
        .fill("#e2e8f0");

      doc.y = 120;

      // Parse and render Markdown lines
      const lines = (markdown || "").split(/\r?\n/);
      let inCodeBlock = false;
      let codeBuffer = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code block toggle
        if (line.trim().startsWith("```")) {
          if (inCodeBlock) {
            // Render collected code block
            const codeText = codeBuffer.join("\n");
            if (codeText.trim()) {
              doc.moveDown(0.3);
              const blockY = doc.y;
              const textHeight = doc.heightOfString(codeText, {
                width: 475,
                font: "Courier",
                fontSize: 8,
              });

              // Check page overflow
              if (blockY + textHeight + 15 > doc.page.height - 50) {
                doc.addPage();
              }

              const currentY = doc.y;
              doc
                .rect(50, currentY, 495, textHeight + 10)
                .fill("#f1f5f9");

              doc
                .rect(50, currentY, 495, textHeight + 10)
                .stroke("#cbd5e1");

              doc
                .fillColor("#0f172a")
                .font("Courier")
                .fontSize(8)
                .text(codeText, 58, currentY + 5, {
                  width: 475,
                  lineGap: 1.5,
                });

              doc.y = currentY + textHeight + 16;
            }
            codeBuffer = [];
            inCodeBlock = false;
          } else {
            inCodeBlock = true;
            codeBuffer = [];
          }
          continue;
        }

        if (inCodeBlock) {
          codeBuffer.push(line);
          continue;
        }

        const trimmed = line.trim();
        if (!trimmed) {
          doc.moveDown(0.3);
          continue;
        }

        // H1 Heading
        if (trimmed.startsWith("# ")) {
          doc.moveDown(0.6);
          if (doc.y > doc.page.height - 80) doc.addPage();
          doc
            .fillColor("#1e3a8a")
            .font("Helvetica-Bold")
            .fontSize(16)
            .text(stripInlineMarkdown(trimmed.slice(2)), 50, doc.y);
          doc.moveDown(0.3);
          continue;
        }

        // H2 Heading
        if (trimmed.startsWith("## ")) {
          doc.moveDown(0.5);
          if (doc.y > doc.page.height - 70) doc.addPage();
          doc
            .fillColor("#2563eb")
            .font("Helvetica-Bold")
            .fontSize(13)
            .text(stripInlineMarkdown(trimmed.slice(3)), 50, doc.y);
          doc.moveDown(0.25);
          continue;
        }

        // H3 Heading
        if (trimmed.startsWith("### ")) {
          doc.moveDown(0.4);
          if (doc.y > doc.page.height - 60) doc.addPage();
          doc
            .fillColor("#334155")
            .font("Helvetica-Bold")
            .fontSize(11)
            .text(stripInlineMarkdown(trimmed.slice(4)), 50, doc.y);
          doc.moveDown(0.2);
          continue;
        }

        // H4 Heading
        if (trimmed.startsWith("#### ")) {
          doc.moveDown(0.3);
          if (doc.y > doc.page.height - 50) doc.addPage();
          doc
            .fillColor("#475569")
            .font("Helvetica-Bold")
            .fontSize(10)
            .text(stripInlineMarkdown(trimmed.slice(5)), 50, doc.y);
          doc.moveDown(0.2);
          continue;
        }

        // Blockquote / Callout (> ...)
        if (trimmed.startsWith(">")) {
          if (doc.y > doc.page.height - 60) doc.addPage();
          const quoteText = stripInlineMarkdown(trimmed.replace(/^>\s*/, ""));
          const currentY = doc.y;
          const qHeight = doc.heightOfString(quoteText, {
            width: 465,
            font: "Helvetica",
            fontSize: 9,
          });

          doc
            .rect(50, currentY, 495, qHeight + 8)
            .fill("#eff6ff");
          doc
            .rect(50, currentY, 3, qHeight + 8)
            .fill("#3b82f6");

          doc
            .fillColor("#1e40af")
            .font("Helvetica")
            .fontSize(9)
            .text(quoteText, 60, currentY + 4, {
              width: 465,
              lineGap: 2,
            });

          doc.y = currentY + qHeight + 12;
          continue;
        }

        // Markdown Table Row (| col1 | col2 | col3 |)
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          // Ignore separator rows like |---|---|
          if (/^\|(\s*[-:]+[-|\s:]*)\|$/.test(trimmed)) {
            continue;
          }

          const rawCols = trimmed
            .slice(1, -1)
            .split("|")
            .map((c) => stripInlineMarkdown(c.trim()));

          if (rawCols.length > 0) {
            if (doc.y > doc.page.height - 45) doc.addPage();
            const currentY = doc.y;
            const colWidth = Math.floor(495 / rawCols.length);

            // Row background
            doc
              .rect(50, currentY, 495, 18)
              .fill("#f8fafc");
            doc
              .rect(50, currentY, 495, 18)
              .stroke("#e2e8f0");

            rawCols.forEach((colText, cIdx) => {
              const cellX = 55 + cIdx * colWidth;
              doc
                .fillColor("#1e293b")
                .font("Helvetica-Bold")
                .fontSize(8.5)
                .text(colText, cellX, currentY + 4, {
                  width: colWidth - 8,
                  height: 14,
                  ellipsis: true,
                });
            });

            doc.y = currentY + 20;
            continue;
          }
        }

        // Bullet point
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          if (doc.y > doc.page.height - 50) doc.addPage();
          const itemText = stripInlineMarkdown(trimmed.slice(2));
          doc
            .fillColor("#2563eb")
            .font("Helvetica-Bold")
            .fontSize(9)
            .text("• ", 60, doc.y, { continued: true });
          doc
            .fillColor("#334155")
            .font("Helvetica")
            .fontSize(9.5)
            .text(itemText, { width: 470, lineGap: 2 });
          doc.moveDown(0.15);
          continue;
        }

        // Numbered list item
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          if (doc.y > doc.page.height - 50) doc.addPage();
          const num = numMatch[1];
          const itemText = stripInlineMarkdown(numMatch[2]);
          doc
            .fillColor("#2563eb")
            .font("Helvetica-Bold")
            .fontSize(9.5)
            .text(`${num}. `, 60, doc.y, { continued: true });
          doc
            .fillColor("#334155")
            .font("Helvetica")
            .fontSize(9.5)
            .text(itemText, { width: 470, lineGap: 2 });
          doc.moveDown(0.15);
          continue;
        }

        // Markdown Image (![alt](path))
        const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (imgMatch) {
          const altCaption = stripInlineMarkdown(imgMatch[1]);
          const rawImgPath = imgMatch[2].trim();
          const resolvedImgPath = path.isAbsolute(rawImgPath)
            ? rawImgPath
            : path.resolve(process.cwd(), rawImgPath);

          if (fs.existsSync(resolvedImgPath)) {
            const maxImgWidth = 460;
            const maxImgHeight = 210;
            const blockHeight = maxImgHeight + (altCaption ? 32 : 16);

            if (doc.y + blockHeight > doc.page.height - 50) {
              doc.addPage();
            }

            doc.moveDown(0.4);
            const startY = doc.y;
            const targetX = 50 + Math.floor((495 - maxImgWidth) / 2);

            try {
              // Frame mockup background
              doc
                .rect(targetX - 4, startY, maxImgWidth + 8, maxImgHeight + 8)
                .fill("#f8fafc");
              doc
                .rect(targetX - 4, startY, maxImgWidth + 8, maxImgHeight + 8)
                .stroke("#e2e8f0");

              doc.image(resolvedImgPath, targetX, startY + 4, {
                fit: [maxImgWidth, maxImgHeight],
                align: "center",
                valign: "center",
              });

              const captionY = startY + maxImgHeight + 12;
              if (altCaption) {
                doc
                  .fillColor("#64748b")
                  .font("Helvetica-Oblique")
                  .fontSize(8.5)
                  .text(`Gambar: ${altCaption}`, 50, captionY, {
                    width: 495,
                    align: "center",
                  });
                doc.y = captionY + 14;
              } else {
                doc.y = captionY + 6;
              }
              doc.moveDown(0.3);
              continue;
            } catch {
              // Fallback jika file gambar rusak/tidak didukung
              doc
                .fillColor("#94a3b8")
                .font("Helvetica-Oblique")
                .fontSize(8.5)
                .text(`[Gambar: ${altCaption || "Tidak dapat dimuat"}]`, 50, doc.y);
              doc.moveDown(0.2);
              continue;
            }
          }
        }

        // Standard Paragraph
        if (doc.y > doc.page.height - 50) doc.addPage();
        doc
          .fillColor("#334155")
          .font("Helvetica")
          .fontSize(9.5)
          .text(stripInlineMarkdown(trimmed), 50, doc.y, {
            width: 495,
            lineGap: 3,
          });
        doc.moveDown(0.2);
      }

      // Add Footer with Page Numbers to all pages safely without triggering auto-page-break
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // Temporarily disable bottom margin so footer coordinate doesn't trigger PDFKit auto-page-break
        const oldBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        const footerLineY = doc.page.height - 35;
        const footerTextY = doc.page.height - 28;

        doc
          .rect(50, footerLineY, 495, 0.5)
          .fill("#cbd5e1");

        doc
          .fillColor("#94a3b8")
          .fontSize(8)
          .font("Helvetica")
          .text(
            "Local Project Manager AI — Dokumentasi Dihasilkan Otomatis",
            50,
            footerTextY,
            { width: 320, align: "left", lineBreak: false }
          );

        doc
          .fillColor("#94a3b8")
          .fontSize(8)
          .font("Helvetica")
          .text(
            `Halaman ${i + 1} dari ${range.count}`,
            doc.page.width - 50 - 150,
            footerTextY,
            { width: 150, align: "right", lineBreak: false }
          );

        doc.page.margins.bottom = oldBottomMargin;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Saves generated PDF buffer and optional markdown to a file in the monitoring system's data/docs/<projectId>/ directory.
 * Returns file info object.
 */
export const savePdfDocument = async (projectId, filename, pdfBuffer, markdownContent = "") => {
  const docsDir = getProjectDocsDir(projectId);
  const filePath = path.join(docsDir, filename);
  await fs.promises.writeFile(filePath, pdfBuffer);

  // Simpan markdown pendamping jika tersedia
  if (markdownContent) {
    const mdFilename = filename.replace(/\.pdf$/i, ".md");
    const mdPath = path.join(docsDir, mdFilename);
    try {
      await fs.promises.writeFile(mdPath, markdownContent, "utf8");
    } catch {
      // ignore
    }
  }

  const stat = await fs.promises.stat(filePath);
  return {
    filename,
    filePath,
    relativePath: path.relative(DEFAULT_DOCS_DIR, filePath),
    sizeBytes: stat.size,
    createdAt: stat.birthtime ? stat.birthtime.toISOString() : new Date().toISOString(),
  };
};

/**
 * Lists all existing generated PDF documents in the monitoring data/docs/<projectId>/ directory.
 */
export const listSavedPdfDocuments = async (projectId) => {
  const docsDir = getProjectDocsDir(projectId);
  const docList = [];

  try {
    const files = await fs.promises.readdir(docsDir, { withFileTypes: true });
    const pdfFiles = files.filter(
      (dirent) => dirent.isFile() && dirent.name.toLowerCase().endsWith(".pdf"),
    );

    for (const file of pdfFiles) {
      const filePath = path.join(docsDir, file.name);
      const stat = await fs.promises.stat(filePath);
      const isTech = file.name.toLowerCase().includes("teknis") || file.name.toLowerCase().includes("technical");
      const isUserGuide = file.name.toLowerCase().includes("user_guide") || file.name.toLowerCase().includes("guide") || file.name.toLowerCase().includes("panduan");

      // Coba baca file markdown pendamping jika ada
      let markdown = "";
      const mdFilename = file.name.replace(/\.pdf$/i, ".md");
      const mdPath = path.join(docsDir, mdFilename);
      if (fs.existsSync(mdPath)) {
        try {
          markdown = await fs.promises.readFile(mdPath, "utf8");
        } catch {
          markdown = "";
        }
      }

      docList.push({
        type: isTech ? "technical" : isUserGuide ? "user_guide" : "custom",
        title: isTech
          ? "Dokumentasi Teknikal"
          : isUserGuide
            ? "User Guide (Panduan Pengguna)"
            : file.name.replace(/\.pdf$/i, ""),
        filename: file.name,
        relativePath: path.relative(DEFAULT_DOCS_DIR, filePath),
        sizeBytes: stat.size,
        createdAt: (stat.birthtime || stat.mtime).toISOString(),
        markdown,
      });
    }

    docList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return docList;
  } catch {
    return [];
  }
};

/**
 * Deletes a generated PDF document and its optional markdown from monitoring data/docs/<projectId>/ directory.
 */
export const deletePdfDocument = async (projectId, filename) => {
  const cleanFilename = path.basename(filename);
  const docsDir = getProjectDocsDir(projectId);
  const filePath = path.join(docsDir, cleanFilename);
  if (fs.existsSync(filePath)) {
    try {
      await fs.promises.unlink(filePath);
    } catch {}
  }

  const mdPath = path.join(docsDir, cleanFilename.replace(/\.pdf$/i, ".md"));
  if (fs.existsSync(mdPath)) {
    try {
      await fs.promises.unlink(mdPath);
    } catch {
      // ignore
    }
  }

  return true;
};
