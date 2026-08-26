export interface TelegramCommand {
  command: string;
  description: string;
  actionType: "built-in" | "project_action" | "custom_response" | "exec";
  action?: string;
  targetProjectId?: string | null;
  customResponse?: string;
  execCommand?: string;
}

export interface TelegramBot {
  id: string;
  name: string;
  token: string;
  username?: string;
  botInfo?: {
    id: number;
    first_name: string;
    username?: string;
  } | null;
  defaultChatId?: string;
  allowedChatIds?: string[];
  enabled: boolean;
  pollingEnabled: boolean;
  notifyOnCrash?: boolean;
  notifyOnRestart?: boolean;
  commands: TelegramCommand[];
  runtimeStatus?: "listening" | "starting" | "stopped" | "error" | "inactive";
  lastActive?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TelegramTestResult {
  success: boolean;
  bot: {
    id: number;
    name: string;
    username?: string;
  };
  messageSent: boolean;
  messageError?: string | null;
}

export interface TelegramActivityLog {
  id: string;
  botId: string;
  type: "command" | "message" | "alert" | "error" | "system";
  details: string;
  timestamp: string;
}
