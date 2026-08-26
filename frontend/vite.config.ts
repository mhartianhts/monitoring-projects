import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 7070,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7171",
        changeOrigin: true,
        timeout: 86400000,
        proxyTimeout: 86400000,
      },
      "/socket.io": {
        target: "http://127.0.0.1:7171",
        ws: true,
        timeout: 86400000,
      },
    },
  },
});
