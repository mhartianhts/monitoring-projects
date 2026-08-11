import type {
  ApiResponse,
  BulkActionResponse,
  EditorInfo,
  GitStatus,
  LogEntry,
  Project,
} from "../types/project";

const handle = async <T>(res: Response): Promise<T> => {
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error || `Request failed (${res.status})`);
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
  aiChat: async (
    projectId: string,
    message: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
  ) => {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, message, history }),
    });
    const body = (await res.json()) as ApiResponse<{
      reply: string;
      stats: unknown;
      projectId: string;
      history?: {
        projectId: string;
        updatedAt: number;
        messages: Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
          ts: number;
        }>;
      };
      hint?: string;
    }>;
    if (!res.ok || !body.success) {
      const hint =
        body.data && typeof body.data === "object" && "hint" in body.data
          ? String((body.data as { hint?: string }).hint || "")
          : "";
      const base = body.error || `Request failed (${res.status})`;
      throw new Error(hint ? `${base}\n${hint}` : base);
    }
    return body.data as {
      reply: string;
      stats: unknown;
      projectId: string;
      history?: {
        projectId: string;
        updatedAt: number;
        messages: Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
          ts: number;
        }>;
      };
    };
  },
  aiSaveHistory: (
    projectId: string,
    messages: Array<unknown>,
    sessionId?: string
  ) =>
    postJson<import("../types/project").ChatHistoryResponse>("/api/ai/history/" + encodeURIComponent(projectId), {
      messages,
      sessionId,
    }),
  aiListSessions: (projectId: string) =>
    fetch(`/api/ai/sessions/${encodeURIComponent(projectId)}`).then((r) =>
      handle<import("../types/project").ChatSessionListResponse>(r)
    ),
  aiCreateSession: (projectId: string, title?: string) =>
    postJson<{ session: import("../types/project").ChatSessionMeta; activeSessionId: string }>(
      `/api/ai/sessions/${encodeURIComponent(projectId)}`,
      { title }
    ),
  aiDeleteSession: (projectId: string, sessionId: string) =>
    fetch(
      `/api/ai/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" }
    ).then((r) => handle<import("../types/project").ChatSessionListResponse>(r)),
  aiRenameSession: (projectId: string, sessionId: string, title: string) =>
    fetch(
      `/api/ai/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }
    ).then((r) => handle<import("../types/project").ChatSessionListResponse>(r)),
  aiGetHistory: (projectId: string, sessionId?: string) => {
    const q = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    return fetch(`/api/ai/history/${encodeURIComponent(projectId)}${q}`).then((r) =>
      handle<import("../types/project").ChatHistoryResponse>(r)
    );
  },
  aiClearHistory: (projectId: string, sessionId?: string) => {
    const q = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    return fetch(`/api/ai/history/${encodeURIComponent(projectId)}${q}`, {
      method: "DELETE",
    }).then((r) => handle<import("../types/project").ChatHistoryResponse>(r));
  },
  aiCommitMessage: async (projectId: string) => {
    const res = await fetch("/api/ai/commit-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const body = (await res.json()) as ApiResponse<{
      message: string;
      stats: unknown;
      projectId: string;
      branch: string | null;
      changedFiles: string[];
      hint?: string;
    }>;
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
  aiAgentRun: (
    projectId: string,
    message: string,
    selectedFiles: string[] = [],
    history: Array<{ role: "user" | "assistant"; content: string }> = []
  ) =>
    postJson<import("../types/project").AgentRunResponse>("/api/ai/agent-run", {
      projectId,
      message,
      selectedFiles,
      history,
    }),
  aiAgentAction: (
    projectId: string,
    actionType: "write_file" | "edit_file" | "run_command",
    payload: Record<string, unknown>
  ) =>
    postJson<{ action: string; result: unknown }>("/api/ai/agent-action", {
      projectId,
      actionType,
      ...payload,
    }),
  aiStreamChat: async (
    projectId: string,
    message: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
    onChunk: (text: string) => void,
    sessionId?: string
  ) => {
    const res = await fetch("/api/ai/stream-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, message, history, sessionId }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData: unknown = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const line = event.trim();
        if (line.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === "chunk" && parsed.text) {
              onChunk(parsed.text);
            } else if (parsed.type === "done") {
              finalData = parsed;
            } else if (parsed.type === "error") {
              throw new Error(parsed.error || "Streaming error");
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
              throw e;
            }
          }
        }
      }
    }
    return finalData;
  },
  aiStreamAgentRun: async (
    projectId: string,
    message: string,
    selectedFiles: string[] = [],
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
    callbacks: {
      onStep?: (step: import("../types/project").AgentStep) => void;
      onChunk?: (text: string) => void;
    } = {},
    sessionId?: string
  ) => {
    const res = await fetch("/api/ai/stream-agent-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, message, selectedFiles, history, sessionId }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData: unknown = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const line = event.trim();
        if (line.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === "step" && parsed.step && callbacks.onStep) {
              callbacks.onStep(parsed.step);
            } else if (parsed.type === "chunk" && parsed.text && callbacks.onChunk) {
              callbacks.onChunk(parsed.text);
            } else if (parsed.type === "done") {
              finalData = parsed;
            } else if (parsed.type === "error") {
              throw new Error(parsed.error || "Streaming error");
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
              throw e;
            }
          }
        }
      }
    }
    return finalData as import("../types/project").AgentRunResponse;
  },
  aiGenerateGitDocs: (
    projectId: string,
    type: "all" | "technical" | "user_guide" = "all",
  ) =>
    postJson<import("../types/project").GitDocsResponse>("/api/ai/git-docs", {
      projectId,
      type,
    }),
  getGitDocDownloadUrl: (projectId: string, filename: string) =>
    `/api/ai/git-docs/download?projectId=${encodeURIComponent(projectId)}&filename=${encodeURIComponent(filename)}`,
};
