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
  };
}

export interface IWebhookInfo {
  path: string;
  method: string;
  skipReply: boolean;
  secretConfigured: boolean;
  localUrl: string;
  lanUrls: string[];
  frontendProxyUrl: string;
  note: string;
}
