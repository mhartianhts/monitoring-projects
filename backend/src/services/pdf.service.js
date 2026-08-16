import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

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
 * Saves generated PDF buffer to a file in the project's docs/ directory.
 * Returns file info object.
 */
export const savePdfDocument = async (projectPath, filename, pdfBuffer) => {
  const docsDir = path.join(projectPath, "docs");
  if (!fs.existsSync(docsDir)) {
    await fs.promises.mkdir(docsDir, { recursive: true });
  }

  const filePath = path.join(docsDir, filename);
  await fs.promises.writeFile(filePath, pdfBuffer);

  const stat = await fs.promises.stat(filePath);
  return {
    filename,
    filePath,
    relativePath: path.relative(projectPath, filePath),
    sizeBytes: stat.size,
    createdAt: new Date().toISOString(),
  };
};
