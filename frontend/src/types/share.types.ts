export interface INetworkInterface {
  name: string;
  ip: string;
  netmask: string;
  isWifi: boolean;
  isEthernet: boolean;
}

export interface IShareInfo {
  selectedIp: string;
  interfaces: INetworkInterface[];
  shareUrl: string;
  backendApiUrl: string;
  backendPort: number;
  frontendPort: number;
  qrCodeDataUrl: string;
}

export interface ISharedFile {
  id: string;
  name: string;
  storedFilename: string;
  size: number;
  mimeType: string;
  sender: "PC" | "PHONE";
  uploadedAt: string;
}

export interface ISharedText {
  id: string;
  content: string;
  sender: "PC" | "PHONE";
  createdAt: string;
}
