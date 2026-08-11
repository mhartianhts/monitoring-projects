import { appConfig } from "../config/app.js";

const BASE_SYSTEM_PROMPT = [
  "You are a helpful assistant embedded in a Local Project Manager dashboard.",
  "You are scoped to ONE selected local project at a time.",
  "Use the provided project context (metadata, recent logs, git status/diff) when answering.",
  "If logs or git data are missing, say what is missing instead of inventing details.",
  "Keep answers concise and practical unless the user asks for more detail.",
  "When asked for a commit message, reply with ONLY the commit message text in Bahasa Indonesia (no quotes, no markdown fences).",
].join(" ");

const COMMIT_SYSTEM_PROMPT = [
  "You write concise git commit messages for a local project.",
  "IMPORTANT: The commit message MUST be written in Indonesian (Bahasa Indonesia).",
  "Use conventional commit style when suitable (feat/fix/chore/refactor/docs),",
  "but keep the description after the type prefix in Indonesian.",
  "Example: feat: tambah tombol generate commit message",
  "Example: fix: perbaiki error parsing log project",
  "Base the message ONLY on the provided git status and diff.",
  "Reply with ONLY the commit message, ideally 1 short subject line.",
  "Optional body is allowed only if truly needed. No quotes. No markdown fences. No explanation.",
].join(" ");

const buildHint = (message = "") => {
  const lower = String(message).toLowerCase();
  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  ) {
    return `Pastikan Ollama berjalan di ${appConfig.ollamaBaseUrl} (cek: ollama serve).`;
  }
  if (lower.includes("not found") || lower.includes("model")) {
    return `Model belum terpasang. Jalankan: ollama pull ${appConfig.ollamaModel}`;
  }
  if (lower.includes("timeout")) {
    return "Ollama lama merespons. Coba lagi atau naikkan OLLAMA_TIMEOUT_MS.";
  }
  return `Pastikan Ollama aktif dan model ${appConfig.ollamaModel} sudah di-pull.`;
};

const createServiceError = (message, status = 502, causeMessage = "") => {
  const error = new Error(message);
  error.status = status;
  error.hint = buildHint(causeMessage || message);
  return error;
};

const fetchWithTimeout = async (
  url,
  options = {},
  timeoutMs = appConfig.ollamaTimeoutMs,
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
        `Ollama timeout setelah ${Math.round(timeoutMs / 1000)}s`,
        504,
        "timeout",
      );
    }
    throw createServiceError(
      error?.message || "Gagal terhubung ke Ollama",
      503,
      error?.message,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const callOllamaChat = async (messages) => {
  let res;
  try {
    res = await fetchWithTimeout(`${appConfig.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: appConfig.ollamaModel,
        messages,
        stream: false,
      }),
    });
  } catch (error) {
    if (error.status) throw error;
    throw createServiceError(
      error.message || "Gagal terhubung ke Ollama",
      503,
      error.message,
    );
  }

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail = data?.error || raw || `Ollama gagal (HTTP ${res.status})`;
    throw createServiceError(
      String(detail),
      res.status === 404 ? 404 : 502,
      String(detail),
    );
  }

  const reply = String(data?.message?.content || "").trim();
  if (!reply) {
    throw createServiceError("Ollama tidak mengembalikan jawaban", 502);
  }

  return {
    reply,
    stats: {
      model: data?.model || appConfig.ollamaModel,
      totalDurationNs: data?.total_duration ?? null,
      evalCount: data?.eval_count ?? null,
      promptEvalCount: data?.prompt_eval_count ?? null,
    },
  };
};

export const getOllamaStatus = async () => {
  const baseUrl = appConfig.ollamaBaseUrl;
  const model = appConfig.ollamaModel;

  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/api/tags`,
      { method: "GET" },
      Math.min(appConfig.ollamaTimeoutMs, 10000),
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        available: false,
        provider: "ollama",
        baseUrl,
        model,
        models: [],
        timeoutMs: appConfig.ollamaTimeoutMs,
        hint: buildHint(text || `HTTP ${res.status}`),
      };
    }

    const data = await res.json();
    const models = Array.isArray(data?.models)
      ? data.models.map((item) => item.name).filter(Boolean)
      : [];
    const hasModel = models.some(
      (name) =>
        name === model ||
        name.startsWith(`${model}:`) ||
        name.startsWith(`${model}-`),
    );

    return {
      available: hasModel,
      provider: "ollama",
      baseUrl,
      model,
      models,
      timeoutMs: appConfig.ollamaTimeoutMs,
      hint: hasModel
        ? `Ollama siap · model ${model}`
        : `Model ${model} belum ada. Jalankan: ollama pull ${model}`,
    };
  } catch (error) {
    return {
      available: false,
      provider: "ollama",
      baseUrl,
      model,
      models: [],
      timeoutMs: appConfig.ollamaTimeoutMs,
      hint: error.hint || buildHint(error.message),
    };
  }
};

export const chatWithOllama = async ({
  message,
  history = [],
  contextText = "",
  systemPrompt = BASE_SYSTEM_PROMPT,
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

  return callOllamaChat(messages);
};

export const streamCallOllamaChat = async (messages, onChunk) => {
  let res;
  try {
    res = await fetchWithTimeout(`${appConfig.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: appConfig.ollamaModel,
        messages,
        stream: true,
      }),
    });
  } catch (error) {
    if (error.status) throw error;
    throw createServiceError(
      error.message || "Gagal terhubung ke Ollama",
      503,
      error.message,
    );
  }

  if (!res.ok) {
    const raw = await res.text();
    throw createServiceError(
      raw || `Ollama gagal (HTTP ${res.status})`,
      res.status === 404 ? 404 : 502,
      raw,
    );
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
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line.trim());
        const token = json?.message?.content || "";
        if (token) {
          fullReply += token;
          if (onChunk) onChunk(token);
        }
        if (json?.done) {
          finalStats = {
            model: json?.model || appConfig.ollamaModel,
            totalDurationNs: json?.total_duration ?? null,
            evalCount: json?.eval_count ?? null,
            promptEvalCount: json?.prompt_eval_count ?? null,
          };
        }
      } catch {
        // ignore chunk parse error
      }
    }
  }

  if (buffer.trim()) {
    try {
      const json = JSON.parse(buffer.trim());
      const token = json?.message?.content || "";
      if (token) {
        fullReply += token;
        if (onChunk) onChunk(token);
      }
      if (json?.done) {
        finalStats = {
          model: json?.model || appConfig.ollamaModel,
          totalDurationNs: json?.total_duration ?? null,
          evalCount: json?.eval_count ?? null,
          promptEvalCount: json?.prompt_eval_count ?? null,
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    reply: fullReply,
    stats: finalStats || { model: appConfig.ollamaModel },
  };
};

export const streamChatWithOllama = async ({
  message,
  history = [],
  contextText = "",
  systemPrompt = BASE_SYSTEM_PROMPT,
  onChunk,
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

  return streamCallOllamaChat(messages, onChunk);
};

export const generateCommitMessageWithOllama = async ({ contextText }) => {
  if (!contextText) {
    throw createServiceError("Konteks git kosong", 400);
  }

  const result = await callOllamaChat([
    { role: "system", content: COMMIT_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "Buatkan commit message dalam Bahasa Indonesia dari konteks git berikut.",
        "Wajib memakai Bahasa Indonesia. Jangan memakai bahasa Inggris.",
        "",
        contextText,
      ].join("\n"),
    },
  ]);

  const cleaned = result.reply
    .replace(/^```[\s\S]*?\n/, "")
    .replace(/```$/, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  return {
    message: cleaned,
    stats: result.stats,
  };
};
