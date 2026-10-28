const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAPI", {
  isDesktop: true,
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  openPath: (pathStr) => ipcRenderer.invoke("desktop:open-path", pathStr),
  minimize: () => ipcRenderer.invoke("desktop:minimize"),
  maximize: () => ipcRenderer.invoke("desktop:maximize"),
  hide: () => ipcRenderer.invoke("desktop:hide"),
  getAppVersion: () => ipcRenderer.invoke("desktop:get-version"),
});
