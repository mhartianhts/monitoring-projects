import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 7070,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7171",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://127.0.0.1:7171",
        ws: true,
      },
    },
  },
});
