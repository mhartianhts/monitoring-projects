export type WebhookKind = "text" | "media" | "contact";

export interface IWebhookMedia {
  filename: string | null;
  mimetype: string | null;
  filesize: number | null;
  gcsUrl: string | null;
  gcsUploadedAt: string | null;
  detectedType: string | null;
  mediaError: string | null;
  localFilename: string | null;
  localSize: number | null;
  downloadError: string | null;
}

export interface IWebhookVcard {
  displayName: string | null;
  phoneNumbers: string[];
  emails: string[];
  organization: string | null;
  title: string | null;
  note: string | null;
  raw: string | null;
}

export interface IWebhookInteractiveButton {
  type: "reply" | "url" | "copy" | "call" | "list";
  id?: string;
  displayText: string;
  url?: string;
  copyCode?: string;
  phoneNumber?: string;
  sections?: Array<{
    title?: string;
    rows: Array<{
      id?: string;
      title?: string;
      description?: string;
      header?: string;
    }>;
  }>;
}

export interface IWebhookInteractivePayload {
  type: "interactive";
  title?: string;
  body: string;
  footer?: string;
  buttons: IWebhookInteractiveButton[];
}

export interface IWebhookBotReply {
  type?: "text" | "interactive" | "media" | "poll" | "reaction" | "location" | "contact";
  text: string | null;
  payload?: any;
  model: string;
  repliedAt?: string;
  failedAt?: string;
  error?: string | null;
}

export interface IWebhookConfig {
  autoReplyEnabled: boolean;
  model: string;
  systemPrompt: string;
  replyTimeoutMs?: number;
  senderMode?: "all" | "whitelist";
  allowedSenders?: string[];
  skipKeywords?: string[];
  groupMode?: "off" | "all" | "whitelist";
  allowedGroups?: string[];
}

export interface IWebhookInboxItem {
  id: string;
  kind: WebhookKind;
  receivedAt: string;
  deviceId: string | null;
  whatsappNumber: string | null;
  senderNumber: string | null;
  message: string | null;
  messageType: string;
  chatType: string;
  groupId: string | null;
  groupName: string | null;
  timestamp: string;
  isVcard: boolean;
  vcardData: IWebhookVcard | string | null;
  contactsArray: unknown[] | null;
  media: IWebhookMedia | null;
  hasLocalMedia: boolean;
  mediaUrl: string | null;
  botReply?: IWebhookBotReply | null;
  raw?: Record<string, unknown>;
}

export interface IWebhookInboxList {
  data: IWebhookInboxItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  counts: {
    all: number;
    text: number;
    media: number;
    contact: number;
    direct?: number;
    group?: number;
  };
}

export interface IWebhookThread {
  threadId?: string;
  isGroup?: boolean;
  groupId?: string | null;
  groupName?: string | null;
  senderNumber: string;
  displayName: string | null;
  whatsappNumber: string | null;
  deviceId: string | null;
  messageCount: number;
  lastReceivedAt: string;
  lastItem: IWebhookInboxItem;
  kinds: WebhookKind[];
  messages: IWebhookInboxItem[];
}

export interface IWebhookThreadList {
  threads: IWebhookThread[];
  totalThreads: number;
  totalMessages: number;
}

export interface IWebhookInfo {
  path: string;
  method: string;
  skipReply: boolean;
  autoReplyEnabled?: boolean;
  model?: string;
  secretConfigured: boolean;
  localUrl: string;
  lanUrls: string[];
  frontendProxyUrl: string;
  note: string;
}
