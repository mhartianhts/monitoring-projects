import type {
  ApiResponse,
  BulkActionResponse,
  EditorInfo,
  GitStatus,
  LogEntry,
  Project,
} from "../types/project";

const parseJsonResponse = async <T>(res: Response): Promise<ApiResponse<T>> => {
  const text = await res.text();
  if (!text || !text.trim()) {
    throw new Error(
      res.ok
        ? "Server mengembalikan respon kosong."
        : `Server gagal merespon (HTTP ${res.status}). Koneksi terputus atau server restart.`
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
    const hint = typeof (body.data as Record<string, unknown>)?.hint === "string"
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
        timeoutMs: number;
        hint: string;
      }>(r),
    ),
  aiCommitMessage: async (projectId: string) => {
    const res = await fetch("/api/ai/commit-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const body = await parseJsonResponse<{
      message: string;
      stats: unknown;
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
      projectId: string;
      branch: string | null;
      changedFiles: string[];
    };
  },
  getProjectTree: (id: string) =>
    fetch(`/api/projects/${id}/files/tree`).then((r) =>
      handle<{ rootName: string; tree: import("../types/project").FileNode[] }>(r)
    ),
  readProjectFile: (id: string, relativePath: string) =>
    fetch(
      `/api/projects/${id}/files/read?path=${encodeURIComponent(relativePath)}`
    ).then((r) => handle<import("../types/project").ProjectFileData>(r)),
  searchProjectFiles: (id: string, query: string) =>
    fetch(
      `/api/projects/${id}/files/search?query=${encodeURIComponent(query)}`
    ).then((r) => handle<import("../types/project").FileSearchResult[]>(r)),
  writeProjectFile: (id: string, relativePath: string, content: string) =>
    postJson<import("../types/project").FileDiffInfo>(
      `/api/projects/${id}/files/write`,
      { path: relativePath, content }
    ),
  editProjectFile: (
    id: string,
    relativePath: string,
    targetContent: string,
    replacementContent: string
  ) =>
    postJson<import("../types/project").FileDiffInfo>(
      `/api/projects/${id}/files/edit`,
      { path: relativePath, targetContent, replacementContent }
    ),
  runProjectCommand: (id: string, command: string) =>
    postJson<import("../types/project").CommandExecutionResult>(
      `/api/projects/${id}/exec`,
      { command }
    ),

  aiStartDocJob: (
    projectId: string,
    type: "all" | "technical" | "user_guide" = "all",
  ) =>
    postJson<import("../types/project").GitDocJob>("/api/ai/git-docs", {
      projectId,
      type,
    }),
  aiGetDocJobStatus: (jobId: string) =>
    fetch(`/api/ai/git-docs/job/${encodeURIComponent(jobId)}`).then((r) =>
      handle<import("../types/project").GitDocJob>(r)
    ),
  aiGetActiveDocJob: (projectId: string) =>
    fetch(`/api/ai/git-docs/active?projectId=${encodeURIComponent(projectId)}`).then((r) =>
      handle<import("../types/project").GitDocJob | null>(r)
    ),
  getGitDocDownloadUrl: (projectId: string, filename: string) =>
    `/api/ai/git-docs/download?projectId=${encodeURIComponent(projectId)}&filename=${encodeURIComponent(filename)}`,

  // Traces & APM
  listTraces: (params: {
    projectId?: string;
    search?: string;
    status?: string;
    minDuration?: number;
    limit?: number;
    offset?: number;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.projectId) q.set("projectId", params.projectId);
    if (params.search) q.set("search", params.search);
    if (params.status) q.set("status", params.status);
    if (params.minDuration) q.set("minDuration", String(params.minDuration));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    return fetch(`/api/traces?${q.toString()}`).then((r) =>
      handle<import("../types/trace.types").ITraceListResponse>(r)
    );
  },
  getTraceById: (traceId: string) =>
    fetch(`/api/traces/${encodeURIComponent(traceId)}`).then((r) =>
      handle<import("../types/trace.types").ITrace>(r)
    ),
  getTraceStats: (projectId?: string) => {
    const q = projectId && projectId !== "all" ? `?projectId=${encodeURIComponent(projectId)}` : "";
    return fetch(`/api/traces/stats${q}`).then((r) =>
      handle<import("../types/trace.types").ITraceStats>(r)
    );
  },
  clearTraces: (projectId?: string) => {
    const q = projectId && projectId !== "all" ? `?projectId=${encodeURIComponent(projectId)}` : "";
    return fetch(`/api/traces/clear${q}`, { method: "DELETE" }).then((r) => handle(r));
  },
  generateMockTraces: (count = 6, projectId = "backend-aira") =>
    postJson<{ count: number; generated: import("../types/trace.types").ITrace[] }>("/api/traces/mock", {
      count,
      projectId,
    }),

  // Code Graph & Architecture
  getCodeGraph: (projectId: string) =>
    fetch(`/api/projects/${encodeURIComponent(projectId)}/graph`).then((r) =>
      handle<import("../types/codeGraph.types").ICodeGraphData>(r)
    ),
  getCodeGraphStats: (projectId: string) =>
    fetch(`/api/projects/${encodeURIComponent(projectId)}/graph/stats`).then((r) =>
      handle<import("../types/codeGraph.types").IGraphStats>(r)
    ),

  // OpenAPI & API Client
  getOpenApiSpec: (projectId: string) =>
    fetch(`/api/projects/${encodeURIComponent(projectId)}/openapi`).then((r) =>
      handle<import("../types/openapi.types").IOpenApiSpecResponse>(r)
    ),
  sendApiRequest: (
    projectId: string,
    params: {
      method: string;
      urlPath: string;
      headers?: Record<string, string>;
      queryParams?: Record<string, any>;
      body?: any;
    }
  ) =>
    postJson<import("../types/openapi.types").IApiProxyResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/api-client/send`,
      params
    ),
};
