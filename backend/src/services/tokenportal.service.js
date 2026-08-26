import { appConfig } from "../config/app.js";

export const TOKENPORTAL_KNOWN_MODELS = [
  {
    id: "kimi-k27-code",
    name: "Kimi K2.7 Code",
    context: "256K",
    description: "Model unggulan untuk coding, analisa git diff, dan reasoning arsitektur",
    capabilities: ["Teks", "Gambar", "Tools", "JSON", "Reasoning"],
    recommended: true,
  },
  {
    id: "kimi-k27-code-fast",
    name: "Kimi K2.7 Code Fast",
    context: "256K",
    description: "Versi cepat dan hemat dari Kimi Code untuk tugas komputasi instan",
    capabilities: ["Teks", "Gambar", "Tools", "JSON"],
  },
  {
    id: "qwen-35b-fast",
    name: "Qwen3.6 35B Fast",
    context: "128K",
    description: "Paling hemat dan super responsif untuk tugas umum & peringkasan",
    capabilities: ["Teks", "Gambar", "Tools", "JSON"],
  },
  {
    id: "qwen-35b",
    name: "Qwen3.6 35B",
    context: "128K",
    description: "Model seimbang dengan kemampuan reasoning & tools",
    capabilities: ["Teks", "Gambar", "Tools", "JSON", "Reasoning"],
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    context: "1M",
    description: "Konteks raksasa 1M token dengan penalaran mendalam dan biaya sangat hemat",
    capabilities: ["Teks", "Tools", "Reasoning"],
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    context: "1M",
    description: "Model generasi mutakhir Kimi dengan context 1M token dan reasoning kuat",
    capabilities: ["Teks", "Gambar", "Tools", "JSON", "Reasoning"],
  },
  {
    id: "kimi-k3-fast",
    name: "Kimi K3 Fast",
    context: "1M",
    description: "Versi cepat Kimi K3 dengan context 1M token",
    capabilities: ["Teks", "Gambar", "Tools", "JSON"],
  },
  {
    id: "glm-52-short",
    name: "GLM-5.2 (short)",
    context: "200K",
    description: "Model penalaran cepat GLM-5.2 untuk dokumen pendek",
    capabilities: ["Teks", "Tools", "Reasoning"],
  },
  {
    id: "glm-52-fast",
    name: "GLM-5.2 Fast",
    context: "1M",
    description: "Model GLM cepat dengan konteks besar 1M token",
    capabilities: ["Teks", "Tools"],
  },
  {
    id: "glm-52",
    name: "GLM-5.2",
    context: "1M",
    description: "Model penalaran flagship GLM dengan context 1M token",
    capabilities: ["Teks", "Tools", "Reasoning"],
  },
  {
    id: "gemma-31b",
    name: "Gemma 4 31B",
    context: "256K",
    description: "Model open-weight dari Google dengan dukungan visi & tools",
    capabilities: ["Teks", "Gambar", "Tools"],
  },
  {
    id: "qwen-3.8-27b",
    name: "Qwen 3.8 27B",
    context: "256K",
    description: "Model Qwen 27B generasi baru dengan multimodal & reasoning",
    capabilities: ["Teks", "Gambar", "Tools", "JSON", "Reasoning"],
  },
  {
    id: "glm-52-short-fast",
    name: "GLM-5.2 short fast",
    context: "200K",
    description: "Model GLM responsif untuk formatting JSON & tools",
    capabilities: ["Teks", "Tools", "JSON"],
  },
];

const BASE_SYSTEM_PROMPT = [
  "You are a helpful assistant embedded in a Local Project Manager dashboard.",
  "You are scoped to ONE selected local project at a time.",
  "Use the provided project context (metadata, recent logs, git status/diff) when answering.",
  "If logs or git data are missing, say what is missing instead of inventing details.",
  "Keep answers concise and practical unless the user asks for more detail.",
  "When asked for a commit message, reply with ONLY the commit message text in Bahasa Indonesia (no quotes, no markdown fences).",
].join(" ");

const COMMIT_SYSTEM_PROMPT = [
  "Anda adalah Senior Software Engineer dan Tech Lead yang sangat teliti dalam menyusun Git Commit Message berkualitas tinggi.",
  "TUGAS UTAMA: Analisis perubahan kode (git status dan git diff) secara mendalam, lalu buat commit message profesional, deskriptif, dan berkelas dalam Bahasa Indonesia.",
  "",
  "ATURAN DAN STANDAR KUALITAS:",
  "1. SUBJECT LINE (Baris 1):",
  "   - Format Conventional Commits: `<type>(<scope>): <ringkasan singkat esensi perubahan>`",
  "   - Tipe yang diperbolehkan: feat, fix, refactor, perf, chore, docs, test, style.",
  "   - Scope menunjukkan modul/fitur utama (contoh: auth, admin, auto-grade, router, store).",
  "   - Huruf kecil, padat, jelas, tanpa titik di akhir.",
  "",
  "2. BARIS KOSONG (Baris 2): Wajib ada 1 baris pemisah kosong.",
  "",
  "3. BODY / RINCIAN PERUBAHAN (Baris 3 ke atas):",
  "   - Sajikan dalam 3 sampai 6 poin penting menggunakan tanda dash (`- `).",
  "   - DILARANG KERAS membuat kalimat repetitif/monoton (contoh buruk: 'tambah komponen X di file A', 'tambah komponen X di file B').",
  "   - Sintesiskan perubahan berdasarkan fungsionalitas dan arsitektur (UI/Komponen, Routing, State Management, Logika Bisnis/Service, API).",
  "   - Gunakan kata kerja aktif teknis bervariasi: 'Implementasikan', 'Integrasikan', 'Sediakan', 'Konfigurasikan', 'Perbarui logika', 'Optimasi', 'Hubungkan'.",
  "   - Jelaskan APA yang dilakukan dan BAGAIMANA fungsionalitasnya berjalan secara substantif.",
  "",
  "4. FORMATTING:",
  "   - DILARANG output markdown code fences (```).",
  "   - DILARANG menggunakan tanda kutip pembungkus.",
  "   - DILARANG memberikan salam, basa-basi, atau teks penjelasan di luar isi commit message.",
  "   - 100% Bahasa Indonesia baku dan profesional.",
].join("\n");

const buildHint = (message = "", statusCode = 0, modelName = "") => {
  const targetModel = modelName || appConfig.tokenportalModel;
  const lower = String(message).toLowerCase();
  if (statusCode === 401 || lower.includes("unauthorized") || lower.includes("api key")) {
    return "API Key TokenPortal belum diisi atau salah. Dapatkan key (awalan tp-) di https://tokenportal.id/api-keys dan masukkan ke TOKENPORTAL_API_KEY di .env.";
  }
  if (statusCode === 402 || lower.includes("insufficient_quota") || lower.includes("saldo")) {
    return "Saldo TokenPortal habis. Silakan top-up saldo PAYG di https://tokenportal.id/topup.";
  }
  if (statusCode === 429 || lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Rate limit TokenPortal tercapai. Harap tunggu beberapa saat sebelum mencoba lagi.";
  }
  if (statusCode === 400 || lower.includes("model not found") || lower.includes("model")) {
    return `Model '${targetModel}' tidak ditemukan. Silakan pilih model lain dari dropdown atau cek https://tokenportal.id/models.`;
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  ) {
    return `Gagal terhubung ke TokenPortal API di ${appConfig.tokenportalBaseUrl}. Pastikan koneksi internet aktif.`;
  }
  if (lower.includes("timeout")) {
    return "TokenPortal API lama merespons. Coba lagi atau naikkan TOKENPORTAL_TIMEOUT_MS di .env.";
  }
  return "Pastikan TOKENPORTAL_API_KEY terisi dengan benar di file .env dan saldo mencukupi.";
};

const createServiceError = (message, status = 502, causeMessage = "", modelName = "") => {
  const error = new Error(message);
  error.status = status;
  error.hint = buildHint(causeMessage || message, status, modelName);
  return error;
};

const fetchWithTimeout = async (
  url,
  options = {},
  timeoutMs = appConfig.tokenportalTimeoutMs,
) => {
  const useTimeout = typeof timeoutMs === "number" && timeoutMs > 0;
  const controller = useTimeout ? new AbortController() : null;
  const timer = useTimeout
    ? setTimeout(() => controller?.abort(), timeoutMs)
    : null;
  try {
    return await fetch(url, {
      ...options,
      signal: controller ? controller.signal : options.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createServiceError(
        `TokenPortal timeout setelah ${Math.round(timeoutMs / 1000)}s`,
        504,
        "timeout",
      );
    }
    throw createServiceError(
      error?.message || "Gagal terhubung ke TokenPortal API",
      503,
      error?.message,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const streamCallTokenPortalChat = async (messages, onChunk, modelOverride = "") => {
  const apiKey = appConfig.tokenportalApiKey?.trim();
  if (!apiKey) {
    throw createServiceError(
      "TOKENPORTAL_API_KEY belum dikonfigurasi di file .env",
      401,
      "unauthorized",
    );
  }

  const chosenModel = modelOverride?.trim() || appConfig.tokenportalModel || "kimi-k27-code";
  let res;
  const endpoint = `${appConfig.tokenportalBaseUrl}/chat/completions`;

  try {
    res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: chosenModel,
        messages,
        stream: true,
      }),
    });
  } catch (error) {
    if (error.status) throw error;
    throw createServiceError(
      error.message || "Gagal terhubung ke TokenPortal API",
      503,
      error.message,
      chosenModel,
    );
  }

  if (!res.ok) {
    let errorMsg = `TokenPortal request gagal (HTTP ${res.status})`;
    try {
      const errorJson = await res.json();
      errorMsg =
        errorJson?.error?.message || errorJson?.message || JSON.stringify(errorJson);
    } catch {
      const rawText = await res.text();
      if (rawText) errorMsg = rawText;
    }
    throw createServiceError(errorMsg, res.status, errorMsg, chosenModel);
  }

  let fullReply = "";
  let finalStats = null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === "[DONE]") break;

      try {
        const json = JSON.parse(dataStr);
        const delta = json?.choices?.[0]?.delta?.content || "";
        if (delta) {
          fullReply += delta;
          if (onChunk) onChunk(delta);
        }
        if (json?.usage) {
          finalStats = {
            model: json?.model || chosenModel,
            promptTokens: json?.usage?.prompt_tokens ?? null,
            completionTokens: json?.usage?.completion_tokens ?? null,
            totalTokens: json?.usage?.total_tokens ?? null,
          };
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }

  const reply = fullReply.trim();
  if (!reply) {
    throw createServiceError(
      "TokenPortal API tidak mengembalikan jawaban",
      502,
      "",
      chosenModel,
    );
  }

  return {
    reply,
    stats: finalStats || { model: chosenModel },
  };
};

export const callTokenPortalChat = async (messages, modelOverride = "") => {
  return streamCallTokenPortalChat(messages, undefined, modelOverride);
};

export const getTokenPortalModels = async () => {
  const baseUrl = appConfig.tokenportalBaseUrl;
  const apiKey = appConfig.tokenportalApiKey?.trim();
  const knownMap = new Map(TOKENPORTAL_KNOWN_MODELS.map((m) => [m.id, m]));

  try {
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const res = await fetchWithTimeout(
      `${baseUrl}/models`,
      { method: "GET", headers },
      Math.min(appConfig.tokenportalTimeoutMs, 8000),
    );

    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
        ? data.models
        : [];

      if (rawList.length > 0) {
        const models = rawList.map((item) => {
          const id = typeof item === "string" ? item : item.id || item.name;
          const meta = knownMap.get(id) || {};
          return {
            id,
            name: meta.name || item.name || id,
            context: meta.context || (item.context_window ? `${Math.round(item.context_window / 1000)}K` : "128K"),
            description: meta.description || item.description || "TokenPortal AI Model",
            capabilities: meta.capabilities || ["Teks", "Tools"],
            recommended: meta.recommended || id === appConfig.tokenportalModel || id === "kimi-k27-code",
          };
        });

        return {
          defaultModel: appConfig.tokenportalModel || "kimi-k27-code",
          models,
        };
      }
    }
  } catch {
    // Fallback to official known models
  }

  return {
    defaultModel: appConfig.tokenportalModel || "kimi-k27-code",
    models: TOKENPORTAL_KNOWN_MODELS,
  };
};

export const getTokenPortalStatus = async () => {
  const baseUrl = appConfig.tokenportalBaseUrl;
  const model = appConfig.tokenportalModel;
  const apiKey = appConfig.tokenportalApiKey?.trim();

  if (!apiKey) {
    return {
      available: false,
      provider: "tokenportal",
      baseUrl,
      model,
      models: TOKENPORTAL_KNOWN_MODELS.map((m) => m.id),
      timeoutMs: appConfig.tokenportalTimeoutMs,
      hint: "TOKENPORTAL_API_KEY belum diisi di .env. Dapatkan key di https://tokenportal.id/api-keys.",
    };
  }

  try {
    const { models } = await getTokenPortalModels();
    const modelIds = models.map((m) => m.id);
    const hasModel =
      modelIds.length === 0 ||
      modelIds.some(
        (id) =>
          id === model ||
          id.toLowerCase().includes(model.toLowerCase()),
      );

    return {
      available: true,
      provider: "tokenportal",
      baseUrl,
      model,
      models: modelIds,
      modelDetails: models,
      timeoutMs: appConfig.tokenportalTimeoutMs,
      hint: hasModel
        ? `TokenPortal API siap · model ${model}`
        : `Model ${model} tidak ditemukan di daftar model TokenPortal.`,
    };
  } catch (error) {
    return {
      available: false,
      provider: "tokenportal",
      baseUrl,
      model,
      models: TOKENPORTAL_KNOWN_MODELS.map((m) => m.id),
      modelDetails: TOKENPORTAL_KNOWN_MODELS,
      timeoutMs: appConfig.tokenportalTimeoutMs,
      hint: error.hint || buildHint(error.message, error.status || 500, model),
    };
  }
};

export const chatWithTokenPortal = async ({
  message,
  history = [],
  contextText = "",
  systemPrompt = BASE_SYSTEM_PROMPT,
  model = "",
}) => {
  const prompt = String(message || "").trim();
  if (!prompt) {
    throw createServiceError("Pesan tidak boleh kosong", 400);
  }

  const systemContent = contextText
    ? `${systemPrompt}\n\n--- PROJECT CONTEXT ---\n${contextText}`
    : systemPrompt;

  const messages = [
    { role: "system", content: systemContent },
    ...history
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string" &&
          item.content.trim(),
      )
      .slice(-12)
      .map((item) => ({
        role: item.role,
        content: item.content.trim(),
      })),
    { role: "user", content: prompt },
  ];

  return callTokenPortalChat(messages, model);
};

export const streamChatWithTokenPortal = async ({
  message,
  history = [],
  contextText = "",
  systemPrompt = BASE_SYSTEM_PROMPT,
  onChunk,
  model = "",
}) => {
  const prompt = String(message || "").trim();
  if (!prompt) {
    throw createServiceError("Pesan tidak boleh kosong", 400);
  }

  const systemContent = contextText
    ? `${systemPrompt}\n\n--- PROJECT CONTEXT ---\n${contextText}`
    : systemPrompt;

  const messages = [
    { role: "system", content: systemContent },
    ...history
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string" &&
          item.content.trim(),
      )
      .slice(-12)
      .map((item) => ({
        role: item.role,
        content: item.content.trim(),
      })),
    { role: "user", content: prompt },
  ];

  return streamCallTokenPortalChat(messages, onChunk, model);
};

export const generateCommitMessageWithTokenPortal = async ({
  contextText,
  model = "",
}) => {
  if (!contextText) {
    throw createServiceError("Konteks git kosong", 400);
  }

  const chosenModel = model?.trim() || appConfig.tokenportalModel;

  const result = await callTokenPortalChat(
    [
      { role: "system", content: COMMIT_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "Analisis data perubahan git di bawah ini dan susun Git Commit Message berkelas industri (Senior Engineer level) dalam Bahasa Indonesia.",
          "",
          "PANDUAN PENULISAN:",
          "1. Tulis Subject Line Conventional Commits yang akurat (contoh: feat(admin): tambah rute dan modul Auto-Grade v2).",
          "2. Buat 3 - 5 poin rincian perubahan yang berbobot, menjelaskan arsitektur/fungsionalitas (UI, Routing, State Management, Business Logic).",
          "",
          "HINDARI POLA MONOTON:",
          "Dilarang mengulang-ulang frasa seperti 'tambah file A', 'tambah file B'. Kelompokkan perubahan berdasarkan fungsionalitasnya.",
          "",
          "Konteks Perubahan Git:",
          contextText,
        ].join("\n"),
      },
    ],
    chosenModel,
  );

  const cleanMessage = result.reply
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```$/, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  return {
    message: cleanMessage,
    stats: result.stats,
    model: chosenModel,
  };
};
