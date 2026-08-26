import type {
  ApiResponse,
  AvailableFolder,
  BulkActionResponse,
  EditorInfo,
  GitStatus,
  LogEntry,
  ManagedProject,
  ManagedProjectsStore,
  Project,
} from "../types/project";

const parseJsonResponse = async <T>(res: Response): Promise<ApiResponse<T>> => {
  const text = await res.text();
  if (!text || !text.trim()) {
    throw new Error(
      res.ok
        ? "Server mengembalikan respon kosong."
        : `Server gagal merespon (HTTP ${res.status}). Koneksi terputus atau server restart.`,
    );
  }
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    if (!res.ok) {
      throw new Error(`Server Error (${res.status}): ${text.slice(0, 150)}`);
    }
    throw new Error("Gagal memproses respon server (Format JSON tidak valid).");
  }
};

const handle = async <T>(res: Response): Promise<T> => {
  const body = await parseJsonResponse<T>(res);
  if (!res.ok || !body.success) {
    const rawError = body.error || `Request failed (${res.status})`;
    const hint =
      typeof (body.data as Record<string, unknown>)?.hint === "string"
        ? (body.data as Record<string, unknown>).hint
        : null;
    const finalMsg = hint ? `${rawError} (${hint})` : rawError;
    throw new Error(finalMsg);
  }
  return body.data as T;
};

const postJson = <T>(url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => handle<T>(r));

export const api = {
  health: () => fetch("/api/health").then((r) => handle<{ status: string }>(r)),
  listProjects: () => fetch("/api/projects").then((r) => handle<Project[]>(r)),
  getAvailableFolders: (root?: string) =>
    fetch(
      `/api/projects/available-folders${root ? `?root=${encodeURIComponent(root)}` : ""}`,
    ).then((r) => handle<AvailableFolder[]>(r)),
  getManagedProjects: () =>
    fetch("/api/projects/managed").then((r) => handle<ManagedProjectsStore>(r)),
  syncSelectedFolders: (folders: Array<Partial<AvailableFolder>>) =>
    postJson<ManagedProject[]>("/api/projects/managed/sync", { folders }),
  addCustomProject: (data: Partial<ManagedProject>) =>
    postJson<ManagedProject>("/api/projects/managed/add", data),
  updateManagedProject: (id: string, data: Partial<ManagedProject>) =>
    fetch(`/api/projects/managed/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => handle<ManagedProject>(r)),
  removeManagedProject: (id: string) =>
    fetch(`/api/projects/managed/${id}`, { method: "DELETE" }).then((r) =>
      handle<{ id: string; removed: boolean }>(r),
    ),
  getProject: (id: string) =>
    fetch(`/api/projects/${id}`).then((r) => handle<Project>(r)),
  listEditors: (refresh = false) =>
    fetch(`/api/projects/editors${refresh ? "?refresh=1" : ""}`).then((r) =>
      handle<EditorInfo[]>(r),
    ),
  start: (id: string) =>
    fetch(`/api/projects/${id}/start`, { method: "POST" }).then((r) =>
      handle<Project>(r),
    ),
  stop: (id: string) =>
    fetch(`/api/projects/${id}/stop`, { method: "POST" }).then((r) =>
      handle<Project>(r),
    ),
  restart: (id: string) =>
    fetch(`/api/projects/${id}/restart`, { method: "POST" }).then((r) =>
      handle<Project>(r),
    ),
  startAll: () => postJson<BulkActionResponse>("/api/projects/start-all"),
  stopAll: () => postJson<BulkActionResponse>("/api/projects/stop-all"),
  restartAll: () => postJson<BulkActionResponse>("/api/projects/restart-all"),
  openFolder: (id: string) =>
    fetch(`/api/projects/${id}/open-folder`, { method: "POST" }).then((r) =>
      handle(r),
    ),
  openBrowser: (id: string) =>
    fetch(`/api/projects/${id}/open-browser`, { method: "POST" }).then((r) =>
      handle(r),
    ),
  openEditor: (id: string, editor: string) =>
    postJson(`/api/projects/${id}/open-editor`, { editor }),
  getLogs: (id: string) =>
    fetch(`/api/projects/${id}/logs?limit=500`).then((r) =>
      handle<LogEntry[]>(r),
    ),
  clearLogs: (id: string) =>
    fetch(`/api/projects/${id}/logs/clear`, { method: "POST" }).then((r) =>
      handle(r),
    ),
  toggleFavorite: (id: string) =>
    fetch(`/api/projects/${id}/favorite`, { method: "POST" }).then((r) =>
      handle<Project>(r),
    ),
  gitStatus: (id: string) =>
    fetch(`/api/projects/${id}/git`).then((r) => handle<GitStatus>(r)),
  gitCreateBranch: (id: string, name: string) =>
    postJson<GitStatus>(`/api/projects/${id}/git/branch`, {
      name,
      checkout: true,
    }),
  gitCheckout: (id: string, name: string) =>
    postJson<GitStatus>(`/api/projects/${id}/git/checkout`, { name }),
  gitAdd: (id: string) => postJson<GitStatus>(`/api/projects/${id}/git/add`),
  gitCommit: (id: string, message: string) =>
    postJson<GitStatus>(`/api/projects/${id}/git/commit`, { message }),
  gitPull: (id: string) => postJson<GitStatus>(`/api/projects/${id}/git/pull`),
  gitPush: (id: string) => postJson<GitStatus>(`/api/projects/${id}/git/push`),
  aiStatus: () =>
    fetch("/api/ai/status").then((r) =>
      handle<{
        available: boolean;
        provider: string;
        baseUrl: string;
        model: string;
        models: string[];
        modelDetails?: import("../types/project").TokenPortalModel[];
        timeoutMs: number;
        hint: string;
      }>(r),
    ),
  aiModels: () =>
    fetch("/api/ai/models").then((r) =>
      handle<import("../types/project").TokenPortalModelsResponse>(r),
    ),
  aiCommitMessage: async (projectId: string, model?: string) => {
    const res = await fetch("/api/ai/commit-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, model: model || undefined }),
    });
    const body = await parseJsonResponse<{
      message: string;
      stats: unknown;
      model?: string;
      projectId: string;
      branch: string | null;
      changedFiles: string[];
      hint?: string;
    }>(res);
    if (!res.ok || !body.success) {
      const hint =
        body.data && typeof body.data === "object" && "hint" in body.data
          ? String((body.data as { hint?: string }).hint || "")
          : "";
      const base = body.error || `Request failed (${res.status})`;
      throw new Error(hint ? `${base}\n${hint}` : base);
    }
    return body.data as {
      message: string;
      stats: unknown;
      model?: string;
      projectId: string;
      branch: string | null;
      changedFiles: string[];
    };
  },
  getProjectTree: (id: string) =>
    fetch(`/api/projects/${id}/files/tree`).then((r) =>
      handle<{ rootName: string; tree: import("../types/project").FileNode[] }>(
        r,
      ),
    ),
  readProjectFile: (id: string, relativePath: string) =>
    fetch(
      `/api/projects/${id}/files/read?path=${encodeURIComponent(relativePath)}`,
    ).then((r) => handle<import("../types/project").ProjectFileData>(r)),
  searchProjectFiles: (id: string, query: string) =>
    fetch(
      `/api/projects/${id}/files/search?query=${encodeURIComponent(query)}`,
    ).then((r) => handle<import("../types/project").FileSearchResult[]>(r)),
  writeProjectFile: (id: string, relativePath: string, content: string) =>
    postJson<import("../types/project").FileDiffInfo>(
      `/api/projects/${id}/files/write`,
      { path: relativePath, content },
    ),
  editProjectFile: (
    id: string,
    relativePath: string,
    targetContent: string,
    replacementContent: string,
  ) =>
    postJson<import("../types/project").FileDiffInfo>(
      `/api/projects/${id}/files/edit`,
      { path: relativePath, targetContent, replacementContent },
    ),
  runProjectCommand: (id: string, command: string) =>
    postJson<import("../types/project").CommandExecutionResult>(
      `/api/projects/${id}/exec`,
      { command },
    ),

  aiStartDocJob: (
    projectId: string,
    type: "all" | "technical" | "user_guide" = "all",
    model?: string,
    baseBranch?: string,
  ) =>
    postJson<import("../types/project").GitDocJob>("/api/ai/git-docs", {
      projectId,
      type,
      model: model || undefined,
      baseBranch: baseBranch || undefined,
    }),
  aiGetDocJobStatus: (jobId: string) =>
    fetch(`/api/ai/git-docs/job/${encodeURIComponent(jobId)}`).then((r) =>
      handle<import("../types/project").GitDocJob>(r),
    ),
  aiGetActiveDocJob: (projectId: string) =>
    fetch(
      `/api/ai/git-docs/active?projectId=${encodeURIComponent(projectId)}`,
    ).then((r) => handle<import("../types/project").GitDocJob | null>(r)),
  aiSubmitDocScreenshots: (jobId: string, formData: FormData) =>
    fetch(`/api/ai/git-docs/job/${encodeURIComponent(jobId)}/screenshots`, {
      method: "POST",
      body: formData,
    }).then((r) => handle<import("../types/project").GitDocJob>(r)),
  aiSkipDocScreenshots: (jobId: string) =>
    postJson<import("../types/project").GitDocJob>(
      `/api/ai/git-docs/job/${encodeURIComponent(jobId)}/skip-screenshots`,
      {},
    ),
  aiListGitDocs: (projectId: string) =>
    fetch(
      `/api/ai/git-docs/list?projectId=${encodeURIComponent(projectId)}`,
    ).then((r) => handle<import("../types/project").GitGeneratedDoc[]>(r)),
  aiDeleteGitDoc: (projectId: string, filename: string) =>
    fetch(
      `/api/ai/git-docs?projectId=${encodeURIComponent(projectId)}&filename=${encodeURIComponent(filename)}`,
      { method: "DELETE" },
    ).then((r) => handle<import("../types/project").GitGeneratedDoc[]>(r)),
  getGitDocDownloadUrl: (projectId: string, filename: string) =>
    `/api/ai/git-docs/download?projectId=${encodeURIComponent(projectId)}&filename=${encodeURIComponent(filename)}`,

  // Document Converter Microservice
  converterStatus: () =>
    fetch("/api/converter/status").then((r) =>
      handle<{
        connected: boolean;
        grpcService?: { is_healthy: boolean; version: string; message: string };
        message?: string;
      }>(r),
    ),
  converterGetFormats: () =>
    fetch("/api/converter/formats").then((r) =>
      handle<
        Array<{
          format: string;
          label: string;
          extension: string;
          targets: Array<{
            format: string;
            label: string;
            extension: string;
            description: string;
          }>;
        }>
      >(r),
    ),
  convertDocument: async (
    file: File,
    fromFormat: string,
    toFormat: string,
    options: { startPage?: number; endPage?: number } = {},
  ): Promise<{ blob: Blob; filename: string; durationMs: number }> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fromFormat", fromFormat);
    formData.append("toFormat", toFormat);
    if (options.startPage)
      formData.append("startPage", String(options.startPage));
    if (options.endPage) formData.append("endPage", String(options.endPage));

    const startTime = performance.now();
    const res = await fetch("/api/converter/convert", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      let errMsg = `Gagal mengonversi file (${res.status})`;
      try {
        const json = await res.json();
        errMsg = json.error || json.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    const durationMs = Math.round(
      Number(res.headers.get("X-Processing-Time-Ms")) ||
        performance.now() - startTime,
    );
    const contentDisp = res.headers.get("Content-Disposition") || "";
    let filename = file.name.replace(/\.[^/.]+$/, `.${toFormat}`);
    const match = contentDisp.match(/filename="?([^"]+)"?/);
    if (match?.[1]) filename = decodeURIComponent(match[1]);

    const blob = await res.blob();
    return { blob, filename, durationMs };
  },
  convertPdfToDocx: async (
    file: File,
    options: { startPage?: number; endPage?: number } = {},
  ): Promise<{ blob: Blob; filename: string; durationMs: number }> => {
    return api.convertDocument(file, "pdf", "docx", options);
  },
  convertDocxToPdf: async (
    file: File,
  ): Promise<{ blob: Blob; filename: string; durationMs: number }> => {
    return api.convertDocument(file, "docx", "pdf");
  },

  // Env Manager & Diff Checker API
  getEnvFiles: (projectId: string) =>
    fetch(`/api/projects/${projectId}/env/files`).then((r) =>
      handle<import("../types/env").EnvFilesResponse>(r),
    ),
  getEnvFileContent: (projectId: string, filename = ".env") =>
    fetch(
      `/api/projects/${projectId}/env/file?name=${encodeURIComponent(filename)}`,
    ).then((r) => handle<import("../types/env").EnvFileContentResponse>(r)),
  saveEnvFileContent: (
    projectId: string,
    filename: string,
    content: string,
    createBackup = true,
  ) =>
    postJson<{
      success: boolean;
      name: string;
      backupCreated: boolean;
      savedAt: string;
    }>(`/api/projects/${projectId}/env/file`, {
      filename,
      content,
      createBackup,
    }),
  createEnvFile: (projectId: string, filename: string, copyFrom?: string) =>
    postJson<{ success: boolean; name: string; createdAt: string }>(
      `/api/projects/${projectId}/env/create`,
      { filename, copyFrom },
    ),
  deleteEnvFile: (projectId: string, filename: string) =>
    fetch(`/api/projects/${projectId}/env/file`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    }).then((r) => handle<{ success: boolean; deleted: string }>(r)),
  compareEnvFiles: (
    projectId: string,
    baseFilename = ".env.example",
    targetFilename = ".env",
  ) =>
    postJson<import("../types/env").EnvCompareResponse>(
      `/api/projects/${projectId}/env/compare`,
      { baseFilename, targetFilename },
    ),
  syncEnvMissingKeys: (
    projectId: string,
    targetFilename = ".env",
    baseFilename = ".env.example",
    keys: string[] = [],
  ) =>
    postJson<{
      success: boolean;
      appendedCount: number;
      appendedKeys: string[];
      backupCreated: boolean;
    }>(`/api/projects/${projectId}/env/sync`, {
      targetFilename,
      baseFilename,
      keys,
    }),
  generateEnvExample: (
    projectId: string,
    sourceFilename = ".env",
    targetFilename = ".env.example",
  ) =>
    postJson<{ success: boolean; target: string; generatedAt: string }>(
      `/api/projects/${projectId}/env/generate-example`,
      { sourceFilename, targetFilename },
    ),
  switchEnvProfile: (projectId: string, sourceFilename: string) =>
    postJson<{
      success: boolean;
      activeProfile: string;
      backupCreated: boolean;
      switchedAt: string;
    }>(`/api/projects/${projectId}/env/switch-profile`, { sourceFilename }),

  // Telegram Bots API
  getTelegramBots: () =>
    fetch("/api/telegram/bots").then((r) =>
      handle<import("../types/telegram").TelegramBot[]>(r),
    ),
  getTelegramBot: (id: string) =>
    fetch(`/api/telegram/bots/${id}`).then((r) =>
      handle<import("../types/telegram").TelegramBot>(r),
    ),
  createTelegramBot: (data: Partial<import("../types/telegram").TelegramBot>) =>
    postJson<import("../types/telegram").TelegramBot>(
      "/api/telegram/bots",
      data,
    ),
  updateTelegramBot: (
    id: string,
    data: Partial<import("../types/telegram").TelegramBot>,
  ) =>
    fetch(`/api/telegram/bots/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => handle<import("../types/telegram").TelegramBot>(r)),
  deleteTelegramBot: (id: string) =>
    fetch(`/api/telegram/bots/${id}`, {
      method: "DELETE",
    }).then((r) => handle<{ deleted: boolean; id: string }>(r)),
  testTelegramBot: (payload: {
    botId?: string;
    token?: string;
    chatId?: string;
  }) =>
    postJson<import("../types/telegram").TelegramTestResult>(
      payload.botId
        ? `/api/telegram/bots/${payload.botId}/test`
        : "/api/telegram/test",
      payload,
    ),
  toggleTelegramBot: (id: string) =>
    postJson<{ id: string; pollingEnabled: boolean; runtimeStatus: string }>(
      `/api/telegram/bots/${id}/toggle`,
    ),
  syncTelegramCommands: (id: string) =>
    postJson<{ success: boolean; count: number }>(
      `/api/telegram/bots/${id}/sync-commands`,
    ),
  runTelegramCommand: (
    id: string,
    payload: { command: string; sendToChat?: boolean; chatId?: string },
  ) =>
    postJson<{
      success: boolean;
      bot: { id: string; name: string; username?: string };
      command: string;
      args: string[];
      output: string;
      sentToTelegram: boolean;
      targetChatId: string | null;
    }>(`/api/telegram/bots/${id}/run-command`, payload),
  saveTelegramCommand: (
    id: string,
    command: import("../types/telegram").TelegramCommand,
  ) =>
    postJson<import("../types/telegram").TelegramBot>(
      `/api/telegram/bots/${id}/commands`,
      command,
    ),
  deleteTelegramCommand: (id: string, command: string) =>
    fetch(`/api/telegram/bots/${id}/commands/${encodeURIComponent(command)}`, {
      method: "DELETE",
    }).then((r) => handle<import("../types/telegram").TelegramBot>(r)),
  sendTelegramMessage: (payload: {
    botId?: string;
    chatId?: string;
    message: string;
    parseMode?: string;
  }) => postJson<{ success: boolean }>("/api/telegram/send", payload),
  getTelegramActivity: () =>
    fetch("/api/telegram/activity").then((r) =>
      handle<import("../types/telegram").TelegramActivityLog[]>(r),
    ),

  getWebhookInfo: () =>
    fetch("/api/webhook/info").then((r) =>
      handle<import("../types/webhook.types").IWebhookInfo>(r),
    ),
  getWebhookInbox: (
    params: {
      page?: number;
      limit?: number;
      kind?: string;
      search?: string;
    } = {},
  ) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.kind && params.kind !== "all") query.set("kind", params.kind);
    if (params.search) query.set("search", params.search);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return fetch(`/api/webhook/inbox${suffix}`).then((r) =>
      handle<import("../types/webhook.types").IWebhookInboxList>(r),
    );
  },
  getWebhookInboxItem: (id: string) =>
    fetch(`/api/webhook/inbox/${encodeURIComponent(id)}`).then((r) =>
      handle<import("../types/webhook.types").IWebhookInboxItem>(r),
    ),
  getWebhookMediaUrl: (id: string) =>
    `/api/webhook/inbox/${encodeURIComponent(id)}/media`,
  deleteWebhookInboxItem: (id: string) =>
    fetch(`/api/webhook/inbox/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).then((r) => handle<{ deleted: boolean; id: string }>(r)),
  clearWebhookInbox: () =>
    fetch("/api/webhook/inbox", { method: "DELETE" }).then((r) =>
      handle<{ deleted: number }>(r),
    ),
};
