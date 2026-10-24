export type ClaudeChatMode = "safe" | "agent";

export interface ClaudeMessageStats {
  durationMs?: number | null;
  totalCostUsd?: number | null;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    [key: string]: any;
  } | null;
}

export interface ClaudeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
  model?: string;
  stats?: ClaudeMessageStats | null;
  isStreaming?: boolean;
}

export interface ClaudeSessionSummary {
  id: string;
  title: string;
  model: string;
  mode: ClaudeChatMode;
  projectId: string | null;
  projectPath: string | null;
  messageCount: number;
  totalCostUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClaudeSessionDetail extends ClaudeSessionSummary {
  messages: ClaudeMessage[];
}

export interface ClaudeModelOption {
  id: string;
  name: string;
  desc: string;
}

export interface ClaudeStatusInfo {
  available: boolean;
  version: string | null;
  binary: string;
  models: ClaudeModelOption[];
  hint: string;
  error?: string;
}
