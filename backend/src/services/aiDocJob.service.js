import path from "node:path";
import fs from "node:fs";
import { getBranchDiffForDocs } from "./git.service.js";
import { chatWithTokenPortal } from "./tokenportal.service.js";
import { createPdfFromMarkdown, savePdfDocument } from "./pdf.service.js";

// In-memory store for AI documentation generation jobs
const jobs = new Map();

export const getDocJob = (jobId) => {
  return jobs.get(String(jobId || "").trim()) || null;
};

export const getActiveDocJobForProject = (projectId) => {
  const pId = String(projectId || "").trim();
  for (const job of jobs.values()) {
    if (
      job.projectId === pId &&
      (job.status === "processing" || job.status === "awaiting_screenshots")
    ) {
      return job;
    }
  }
  return null;
};

const updateJob = (jobId, patch) => {
  const existing = jobs.get(jobId);
  if (!existing) return;
  const updated = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  jobs.set(jobId, updated);
  return updated;
};

/**
 * Parses screenshot requirements from AI JSON response safely
 */
const parseScreenshotNeeds = (rawReply) => {
  try {
    const cleaned = String(rawReply || "")
      .replace(/^```[a-zA-Z]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    // Find JSON array in the response
    const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item, idx) => ({
        id: String(item.id || `slot_${idx + 1}`).trim(),
        section: String(item.section || `Langkah ${idx + 1}`).trim(),
        instruction: String(item.instruction || "Ambil screenshot antarmuka terkait langkah ini.").trim(),
        sampleCaption: String(item.sampleCaption || item.section || `Tampilan Antarmuka ${idx + 1}`).trim(),
      }));
  } catch {
    return [];
  }
};

/**
 * Phase 2: Final Document Generation with embedded screenshots
 */
export const resumeDocJobWithScreenshots = async ({
  jobId,
  uploadedScreenshots = [], // Array of { id, originalName, filePath, caption }
  skipped = false,
}) => {
  const job = getDocJob(jobId);
  if (!job) {
    throw new Error("Job tidak ditemukan");
  }

  if (job.status !== "awaiting_screenshots" && job.status !== "processing") {
    return job;
  }

  const { project, docType, model, diffData, safeBranch } = job._context || {};
  if (!project || !diffData) {
    throw new Error("Konteks dokumen tidak valid atau telah kedaluwarsa");
  }

  updateJob(jobId, {
    status: "processing",
    progress: 45,
    step: "Menyusun isi dokumentasi & menyematkan visual...",
    uploadedScreenshots: skipped ? [] : uploadedScreenshots,
  });

  const promptText = `Berikut adalah data perubahan git di branch ${diffData.branch}:\n\n${diffData.summary}`;
  const generatedDocs = [];

  try {
    // 1. Generate Technical Doc
    const generateTechnicalDoc = async () => {
      updateJob(jobId, {
        progress: 55,
        step: "Membuat Dokumentasi Teknikal via AI...",
      });

      const techUserMessage = [
        "PERINGATAN SANGAT PENTING:",
        "1. Seluruh isi dokumen WAJIB ditulis 100% dalam Bahasa Indonesia baku yang profesional.",
        "2. DILARANG KERAS men-dump raw git diff (seperti 'diff --git', patch '+' / '-') atau menyalin seluruh isi file kode mentah.",
        "3. Tulis secara padat, jelas, to-the-point, dan berbobot arsitektural.",
        "",
        `Buatkan Ringkasan Dokumentasi Teknikal untuk proyek '${project.name}' berdasarkan perubahan git branch '${diffData.branch}':`,
        promptText,
        "",
        "Struktur Markdown yang WAJIB digunakan:",
        "# Dokumentasi Teknikal",
        "## 1. Ringkasan Perubahan Teknikal",
        "## 2. Tabel File & Modul yang Mengalami Perubahan",
        "- Format tabel: | Nama File / Modul | Status | Deskripsi Perubahan & Peran |",
        "## 3. Detail Implementasi & Perubahan Logika Utama",
        "- Jelaskan alur kerja atau fungsi penting. Jika ada kode, cantumkan hanya snippet pendek (< 8 baris).",
        "## 4. Konfigurasi & Dependensi System",
        "## 5. Rekomendasi Pengujian & Pemeliharaan",
      ].join("\n");

      const techRes = await chatWithTokenPortal({
        message: techUserMessage,
        systemPrompt:
          "Anda adalah Lead Software Architect. Tulis dokumentasi teknikal yang bersih, elegan, to-the-point, dan bebas dari dump raw diff. 100% Bahasa Indonesia.",
        model,
      });

      const cleanTechMarkdown = techRes.reply
        .replace(/^```[a-zA-Z]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      updateJob(jobId, {
        progress: 70,
        step: "Meng-generate file PDF Dokumentasi Teknikal...",
      });

      const techPdfBuffer = await createPdfFromMarkdown({
        title: "Dokumentasi Teknikal",
        subtitle: diffData.branch,
        markdown: cleanTechMarkdown,
        projectName: project.name,
      });

      const techFilename = `${safeBranch}_Dokumentasi_Teknis.pdf`;
      const techFileInfo = await savePdfDocument(
        project.path,
        techFilename,
        techPdfBuffer,
        cleanTechMarkdown,
      );

      return {
        type: "technical",
        title: "Dokumentasi Teknikal",
        filename: techFileInfo.filename,
        relativePath: techFileInfo.relativePath,
        sizeBytes: techFileInfo.sizeBytes,
        createdAt: techFileInfo.createdAt,
        markdown: cleanTechMarkdown,
      };
    };

    // 2. Generate User Guide Doc with Screenshots Embedded
    const generateUserGuideDoc = async (baseProgress = 70) => {
      updateJob(jobId, {
        progress: baseProgress,
        step: "Membuat User Guide & menyematkan screenshot visual...",
      });

      let screenshotInstructions = "";
      if (uploadedScreenshots && uploadedScreenshots.length > 0) {
        screenshotInstructions = [
          "",
          "PANDUAN PENYEMATAN GAMBAR/SCREENSHOT:",
          "Gunakan gambar yang sudah diunggah berikut pada bagian langkah yang sesuai menggunakan sintaks Markdown: `![Deskripsi Gambar](path_ke_gambar)`",
          "Daftar gambar yang tersedia:",
          ...uploadedScreenshots.map(
            (s) =>
              `- Bagian/Langkah: '${s.section || s.id}' | Sintaks: ![${s.caption || s.sampleCaption || "Screenshot Antarmuka"}](${s.filePath.replace(/\\/g, "/")})`
          ),
          "PASTIKAN Anda menyisipkan tag gambar persis di bawah langkah yang bersangkutan.",
        ].join("\n");
      }

      const userGuideUserMessage = [
        "PERINGATAN SANGAT PENTING:",
        "1. Seluruh isi panduan WAJIB ditulis 100% dalam Bahasa Indonesia yang ramah, jelas, dan mudah dipahami pengguna/admin.",
        "2. DILARANG KERAS menyertakan sintaks kode pemrograman atau raw git diff.",
        "3. Tulis secara padat, praktis, dan berorientasi pada antarmuka (UI/UX).",
        screenshotInstructions,
        "",
        `Buatkan Panduan Pengguna (User Guide) praktis untuk proyek '${project.name}' berdasarkan perubahan fitur berikut:`,
        promptText,
        "",
        "Struktur Markdown yang WAJIB digunakan:",
        "# Panduan Pengguna (User Guide)",
        "## 1. Pengenalan Fitur & Manfaat",
        "## 2. Prasyarat Penggunaan",
        "## 3. Langkah-Langkah Penggunaan (Panduan Praktis Step-by-Step)",
        "- Berikan panduan bernomor alur klik dan input secara visual.",
        "- Sisipkan gambar/screenshot yang tersedia di langkah-langkah yang sesuai.",
        "## 4. Tips & Troubleshooting (Penanganan Masalah)",
        "## 5. Pertanyaan yang Sering Diajukan (FAQ)",
      ].join("\n");

      const userRes = await chatWithTokenPortal({
        message: userGuideUserMessage,
        systemPrompt:
          "Anda adalah Senior UX Writer. Tulis panduan pengguna yang sangat jelas, ramah, kaya visual dan bebas dari istilah koding/diff git. 100% Bahasa Indonesia.",
        model,
      });

      const cleanUserMarkdown = userRes.reply
        .replace(/^```[a-zA-Z]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      updateJob(jobId, {
        progress: 88,
        step: "Meng-generate file PDF User Guide...",
      });

      const userPdfBuffer = await createPdfFromMarkdown({
        title: "User Guide (Panduan Pengguna)",
        subtitle: diffData.branch,
        markdown: cleanUserMarkdown,
        projectName: project.name,
      });

      const userFilename = `${safeBranch}_User_Guide.pdf`;
      const userFileInfo = await savePdfDocument(
        project.path,
        userFilename,
        userPdfBuffer,
        cleanUserMarkdown,
      );

      return {
        type: "user_guide",
        title: "User Guide (Panduan Pengguna)",
        filename: userFileInfo.filename,
        relativePath: userFileInfo.relativePath,
        sizeBytes: userFileInfo.sizeBytes,
        createdAt: userFileInfo.createdAt,
        markdown: cleanUserMarkdown,
      };
    };

    if (docType === "technical") {
      const techDoc = await generateTechnicalDoc();
      generatedDocs.push(techDoc);
    } else if (docType === "user_guide") {
      const userDoc = await generateUserGuideDoc(55);
      generatedDocs.push(userDoc);
    } else {
      const techDoc = await generateTechnicalDoc();
      generatedDocs.push(techDoc);
      const userDoc = await generateUserGuideDoc(75);
      generatedDocs.push(userDoc);
    }

    return updateJob(jobId, {
      status: "completed",
      progress: 100,
      step: "Dokumentasi PDF AI berhasil digenerasi!",
      docs: generatedDocs,
    });
  } catch (error) {
    return updateJob(jobId, {
      status: "failed",
      step: "Gagal membuat dokumen",
      error: error.message || "Gagal membuat dokumen",
      hint: error.hint || undefined,
    });
  }
};

/**
 * Phase 1: Analyze diff & identify screenshot needs
 */
const runDocJob = async (jobId, project, docType, model = "", baseBranch = "") => {
  try {
    updateJob(jobId, {
      status: "processing",
      progress: 10,
      step: "Menganalisis riwayat dan perubahan git...",
    });

    const diffData = await getBranchDiffForDocs(project.path, {
      targetBaseBranch: baseBranch,
    });
    const safeBranch = (diffData.branch || "branch").replace(
      /[^a-zA-Z0-9_\-]/g,
      "_",
    );

    // Save context in job memory for Phase 2 resume
    updateJob(jobId, {
      _context: {
        project,
        docType,
        model,
        baseBranch: diffData.baseBranch || baseBranch,
        diffData,
        safeBranch,
      },
    });

    // If User Guide is requested (either user_guide or all), analyze screenshot needs
    const requiresVisualAnalysis = docType === "all" || docType === "user_guide";

    if (requiresVisualAnalysis) {
      updateJob(jobId, {
        progress: 25,
        step: "Menganalisis kebutuhan screenshot antarmuka...",
      });

      const analysisPrompt = [
        `Analisis perubahan kode di branch '${diffData.branch}'${diffData.baseBranch ? ` terhadap base branch '${diffData.baseBranch}'` : ''} untuk proyek '${project.name}':`,
        diffData.summary,
        "",
        "TUGAS:",
        "Petakan seluruh poin/langkah antarmuka (UI) penting yang membutuhkan tangkapan layar (screenshot) agar panduan pengguna menjadi jelas, visual, dan komprehensif. Jangan batasi jumlahnya jika memang ada beberapa langkah alur fitur yang perlu divisualisasikan.",
        "Kembalikan respon DALAM FORMAT JSON ARRAY MURNI dengan struktur berikut:",
        `[
  {
    "id": "slot_1",
    "section": "Langkah 1: Nama Bagian / Menu",
    "instruction": "Instruksi spesifik screenshot apa yang harus diambil (contoh: 'Ambil screenshot halaman form X dengan tombol Simpan')",
    "sampleCaption": "Caption Gambar yang Sesuai"
  }
]`,
        "Jika perubahan ini murni perubahan backend tanpa antarmuka pengguna sama sekali, kembalikan array kosong: []",
      ].join("\n");

      const analysisRes = await chatWithTokenPortal({
        message: analysisPrompt,
        systemPrompt:
          "Anda adalah Technical UX Writer & Documentation Specialist. Identifikasi kebutuhan visual screenshot pengguna secara presisi. Kembalikan JSON valid murni.",
        model,
      });

      const screenshotSlots = parseScreenshotNeeds(analysisRes.reply);

      // If AI determined screenshot slots are needed, pause and await user upload
      if (screenshotSlots.length > 0) {
        updateJob(jobId, {
          status: "awaiting_screenshots",
          progress: 35,
          step: "Menunggu screenshot dari pengguna...",
          requestedScreenshots: screenshotSlots,
        });
        return;
      }
    }

    // If no screenshots needed or pure technical doc, proceed directly to phase 2
    await resumeDocJobWithScreenshots({
      jobId,
      uploadedScreenshots: [],
      skipped: true,
    });
  } catch (error) {
    updateJob(jobId, {
      status: "failed",
      step: "Gagal menganalisis dokumen",
      error: error.message || "Gagal menganalisis dokumen",
      hint: error.hint || undefined,
    });
  }
};

export const startDocJob = ({
  project,
  docType = "all",
  model = "",
  baseBranch = "",
}) => {
  // If an active job already exists for this project, return that existing job
  const activeJob = getActiveDocJobForProject(project.id);
  if (activeJob) {
    return activeJob;
  }

  const jobId = `doc_job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const initialJob = {
    id: jobId,
    projectId: project.id,
    projectName: project.name,
    type: docType,
    model: model || undefined,
    baseBranch: baseBranch || undefined,
    status: "processing",
    progress: 5,
    step: "Memulai proses background...",
    requestedScreenshots: [],
    docs: [],
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  jobs.set(jobId, initialJob);

  // Trigger worker asynchronously without blocking HTTP response
  void runDocJob(jobId, project, docType, model, baseBranch);

  return initialJob;
};
