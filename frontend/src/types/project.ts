export type ProjectStatus = "running" | "stopped";

export interface ProjectStats {
  cpu: number;
  memory: number;
  uptime: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  type: string;
  port: number | null;
  start: string | null;
  stop: string | null;
  cwd: string;
  hasConfig: boolean;
  configError: string | null;
  configSource: "file" | "auto" | "extra" | null;
  favorite: boolean;
  status: ProjectStatus;
  pid: number | null;
  stats: ProjectStats;
  url?: string | null;
}

export interface BulkActionResult {
  id: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export interface BulkActionResponse {
  action: string;
  results: BulkActionResult[];
  projects: Project[];
}

export interface EditorInfo {
  id: "cursor" | "code" | "antigravity" | string;
  label: string;
  command: string | null;
  available: boolean;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  branches: string[];
  dirty: boolean;
  ahead: number;
  behind: number;
  changedFiles: string[];
  remote: string | null;
}

export interface LogEntry {
  line: string;
  stream: "stdout" | "stderr" | "system";
  ts: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
}

export interface ProjectFileTree {
  rootName: string;
  tree: FileNode[];
}

export interface ProjectFileData {
  path: string;
  isBinary: boolean;
  size: number;
  content: string;
}

export interface FileSearchResult {
  path: string;
  matchType: "filename" | "content";
  line: number;
  content: string;
}

export interface AgentStep {
  id: string;
  title: string;
  type: "inspect" | "read" | "search" | "analyze" | "modify" | "exec" | "report";
  status: "pending" | "success" | "error";
  details?: string;
  timestamp: number;
}

export interface FileDiffInfo {
  path: string;
  isNew: boolean;
  originalContent: string | null;
  newContent: string;
}

export interface CommandExecutionResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string | null;
  durationMs: number;
}

export interface AgentRunResponse {
  reply: string;
  stats?: unknown;
  projectId: string;
  steps: AgentStep[];
  modifiedFiles: FileDiffInfo[];
  commandOutputs: CommandExecutionResult[];
  selectedFiles: string[];
  history?: ChatHistoryResponse;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ChatSessionListResponse {
  projectId: string;
  activeSessionId: string | null;
  sessions: ChatSessionMeta[];
}

export interface ChatHistoryResponse {
  projectId: string;
  activeSessionId: string | null;
  sessionId: string;
  title: string;
  updatedAt: number;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    ts?: number;
    steps?: AgentStep[];
    modifiedFiles?: FileDiffInfo[];
    commandOutputs?: CommandExecutionResult[];
  }>;
}

export interface GitGeneratedDoc {
  type: "technical" | "user_guide";
  title: string;
  filename: string;
  relativePath: string;
  sizeBytes: number;
  createdAt: string;
  markdown: string;
}

export interface DocScreenshotSlot {
  id: string;
  section: string;
  instruction: string;
  sampleCaption?: string;
}

export interface GitDocJob {
  id: string;
  projectId: string;
  projectName?: string;
  type: "all" | "technical" | "user_guide";
  model?: string;
  status: "processing" | "awaiting_screenshots" | "completed" | "failed";
  progress: number;
  step: string;
  requestedScreenshots?: DocScreenshotSlot[];
  docs: GitGeneratedDoc[];
  error?: string | null;
  hint?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TokenPortalModel {
  id: string;
  name: string;
  context: string;
  description: string;
  capabilities: string[];
  recommended?: boolean;
}

export interface TokenPortalModelsResponse {
  defaultModel: string;
  models: TokenPortalModel[];
}

export interface AvailableFolder {
  id: string;
  name: string;
  folderName: string;
  path: string;
  type: string;
  start: string | null;
  stop: string | null;
  port: number | null;
  url: string | null;
  cwd: string;
  hasConfig: boolean;
  configSource: "file" | "auto" | null;
  configError: string | null;
  isManaged: boolean;
  enabled: boolean;
}

export interface ManagedProject {
  id: string;
  name: string;
  path: string;
  type: string;
  start: string | null;
  stop: string | null;
  port: number | null;
  url: string | null;
  cwd: string;
  enabled: boolean;
}

export interface ManagedProjectsStore {
  initialized: boolean;
  projects: ManagedProject[];
}



