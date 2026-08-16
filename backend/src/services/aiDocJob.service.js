import { getBranchDiffForDocs } from "./git.service.js";
import { chatWithOllama } from "./ollama.service.js";
import { createPdfFromMarkdown, savePdfDocument } from "./pdf.service.js";

// In-memory store for AI documentation generation jobs
const jobs = new Map();

export const getDocJob = (jobId) => {
  return jobs.get(String(jobId || "").trim()) || null;
};

export const getActiveDocJobForProject = (projectId) => {
  const pId = String(projectId || "").trim();
  for (const job of jobs.values()) {
    if (job.projectId === pId && job.status === "processing") {
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

const runDocJob = async (jobId, project, docType) => {
  try {
    updateJob(jobId, {
      status: "processing",
      progress: 10,
      step: "Menganalisis riwayat dan perubahan git...",
    });

    const diffData = await getBranchDiffForDocs(project.path);
    const safeBranch = (diffData.branch || "branch").replace(
      /[^a-zA-Z0-9_\-]/g,
      "_",
    );
    const promptText = `Berikut adalah data perubahan git di branch ${diffData.branch}:\n\n${diffData.summary}`;
    const generatedDocs = [];

    // Helper Technical Doc
    const generateTechnicalDoc = async () => {
      updateJob(jobId, {
        progress: 25,
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

      const techRes = await chatWithOllama({
        message: techUserMessage,
        systemPrompt:
          "Anda adalah Lead Software Architect. Tulis dokumentasi teknikal yang bersih, elegan, to-the-point, dan bebas dari dump raw diff. 100% Bahasa Indonesia.",
      });

      const cleanTechMarkdown = techRes.reply
        .replace(/^```[a-zA-Z]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      updateJob(jobId, {
        progress: 50,
        step: "Meng-generate file PDF Dokumentasi Teknikal...",
      });

      const techPdfBuffer = await createPdfFromMarkdown({
        title: "Dokumentasi Teknikal",
        subtitle: diffData.branch,
        markdown: cleanTechMarkdown,
        projectName: project.name,
      });

      const techFileInfo = await savePdfDocument(
        project.path,
        `Dokumentasi_Teknis_${safeBranch}.pdf`,
        techPdfBuffer,
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

    // Helper User Guide Doc
    const generateUserGuideDoc = async (baseProgress = 55) => {
      updateJob(jobId, {
        progress: baseProgress,
        step: "Membuat User Guide via AI...",
      });

      const userGuideUserMessage = [
        "PERINGATAN SANGAT PENTING:",
        "1. Seluruh isi panduan WAJIB ditulis 100% dalam Bahasa Indonesia yang ramah, jelas, dan mudah dipahami pengguna/admin.",
        "2. DILARANG KERAS menyertakan sintaks kode pemrograman atau raw git diff.",
        "3. Tulis secara padat, praktis, dan berorientasi pada antarmuka (UI/UX).",
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
        "## 4. Tips & Troubleshooting (Penanganan Masalah)",
        "## 5. Pertanyaan yang Sering Diajukan (FAQ)",
      ].join("\n");

      const userRes = await chatWithOllama({
        message: userGuideUserMessage,
        systemPrompt:
          "Anda adalah Senior UX Writer. Tulis panduan pengguna yang sangat jelas, ramah, dan bebas dari istilah koding/diff git. 100% Bahasa Indonesia.",
      });

      const cleanUserMarkdown = userRes.reply
        .replace(/^```[a-zA-Z]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      updateJob(jobId, {
        progress: 85,
        step: "Meng-generate file PDF User Guide...",
      });

      const userPdfBuffer = await createPdfFromMarkdown({
        title: "User Guide (Panduan Pengguna)",
        subtitle: diffData.branch,
        markdown: cleanUserMarkdown,
        projectName: project.name,
      });

      const userFileInfo = await savePdfDocument(
        project.path,
        `User_Guide_${safeBranch}.pdf`,
        userPdfBuffer,
      );

      return {
        type: "user_guide",
        title: "User Guide",
        filename: userFileInfo.filename,
        relativePath: userFileInfo.relativePath,
        sizeBytes: userFileInfo.sizeBytes,
        createdAt: userFileInfo.createdAt,
        markdown: cleanUserMarkdown,
      };
    };

    if (docType === "technical") {
      const doc = await generateTechnicalDoc();
      generatedDocs.push(doc);
    } else if (docType === "user_guide") {
      const doc = await generateUserGuideDoc(25);
      generatedDocs.push(doc);
    } else {
      // Type "all": Process technical then user guide sequentially in background
      const techDoc = await generateTechnicalDoc();
      generatedDocs.push(techDoc);
      updateJob(jobId, { docs: [...generatedDocs] });

      const userDoc = await generateUserGuideDoc(60);
      generatedDocs.push(userDoc);
    }

    updateJob(jobId, {
      status: "completed",
      progress: 100,
      step: "Dokumentasi PDF AI berhasil digenerasi!",
      docs: generatedDocs,
    });
  } catch (error) {
    updateJob(jobId, {
      status: "failed",
      step: "Gagal membuat dokumen",
      error: error.message || "Gagal membuat dokumen",
      hint: error.hint || undefined,
    });
  }
};

export const startDocJob = ({ project, docType = "all" }) => {
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
    status: "processing",
    progress: 5,
    step: "Memulai proses background...",
    docs: [],
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  jobs.set(jobId, initialJob);

  // Trigger worker asynchronously without blocking HTTP response
  void runDocJob(jobId, project, docType);

  return initialJob;
};
