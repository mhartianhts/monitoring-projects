export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  model?: string;
  isStreaming?: boolean;
  stats?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  };
  createdAt?: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  model: string;
  messageCount: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessage[];
}
