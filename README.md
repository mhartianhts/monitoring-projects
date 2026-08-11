# Local Project Manager Dashboard

Dashboard lokal untuk Start / Stop / Restart project di `D:\mhartian\project`, dengan log realtime.

## Stack
- Backend: Node.js + Express + Socket.IO
- Frontend: Vue 3 + Vite + Tailwind + Pinia
- Runtime: **host Windows** (bukan Docker) agar bisa spawn process & buka Explorer

## Quick start

```bash
# dari root repo
npm run install:all
npm run dev
```

- Frontend: http://localhost:7070
- Backend API: http://localhost:7171/api/health

## Konfigurasi project

Copy salah satu contoh di `examples/` ke folder project sebagai `project.config.json`.

Contoh Node:

```json
{
  "name": "Backend Aira",
  "type": "node",
  "start": "npm run dev",
  "port": 3000,
  "cwd": "."
}
```

Tanpa file ini, project tetap muncul di sidebar, tapi tombol Start disabled.

## Environment

Salin `.env.example` → `.env`:

```
PROJECTS_ROOT=D:\mhartian\project
PORT=7171
FRONTEND_ORIGIN=http://localhost:7070
```

## Fitur MVP
- Auto-discovery semua subfolder root
- Start / Stop / Restart (native + docker compose)
- Log realtime + auto-scroll + clear
- CPU / Memory / Uptime
- Open Folder / Open Browser
- Saat backend di-stop (Ctrl+C / SIGINT), semua managed process ikut di-stop
- Restart backend via `--watch` (SIGTERM) **tidak** menghentikan project yang sedang jalan; PID di-reattach otomatis
