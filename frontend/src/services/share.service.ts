import type { IShareInfo, ISharedFile, ISharedText } from "../types/share.types";

const parseJson = async <T>(res: Response): Promise<T> => {
  const text = await res.text();
  if (!text || !text.trim()) {
    throw new Error(res.ok ? "Respon kosong dari server" : `HTTP Error ${res.status}`);
  }
  const json = JSON.parse(text);
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json.data as T;
};

export const shareService = {
  getShareInfo: (ip?: string): Promise<IShareInfo> => {
    const q = ip ? `?ip=${encodeURIComponent(ip)}` : "";
    return fetch(`/api/share/info${q}`).then(parseJson<IShareInfo>);
  },

  listFiles: (): Promise<ISharedFile[]> => {
    return fetch("/api/share/files").then(parseJson<ISharedFile[]>);
  },

  uploadFile: async (file: File, sender: "PC" | "PHONE" = "PC"): Promise<ISharedFile> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sender", sender);

    const res = await fetch("/api/share/upload", {
      method: "POST",
      body: formData,
    });
    return parseJson<ISharedFile>(res);
  },

  deleteFile: (id: string): Promise<{ deleted: boolean; id: string }> => {
    return fetch(`/api/share/files/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).then(parseJson<{ deleted: boolean; id: string }>);
  },

  getDownloadUrl: (id: string): string => {
    return `/api/share/download/${encodeURIComponent(id)}`;
  },

  listTexts: (): Promise<ISharedText[]> => {
    return fetch("/api/share/texts").then(parseJson<ISharedText[]>);
  },

  addText: (content: string, sender: "PC" | "PHONE" = "PC"): Promise<ISharedText> => {
    return fetch("/api/share/texts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, sender }),
    }).then(parseJson<ISharedText>);
  },

  deleteText: (id: string): Promise<{ deleted: boolean; id: string }> => {
    return fetch(`/api/share/texts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).then(parseJson<{ deleted: boolean; id: string }>);
  },
};
