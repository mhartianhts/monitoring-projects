# Local Project Manager Dashboard

## Project Overview

### Background

Saya memiliki banyak project lokal dengan berbagai teknologi seperti
Node.js, Vue.js, Python Flask, dan lainnya.

Selama ini saya harus membuka banyak terminal untuk menjalankan setiap
project secara manual. Hal ini kurang efisien ketika harus
berpindah-pindah project, memantau log, atau me-restart service.

Saya ingin membuat sebuah aplikasi web yang berfungsi sebagai **Local
Project Manager Dashboard**, yaitu pusat pengelolaan seluruh project
lokal dari satu tempat.

Aplikasi ini hanya digunakan pada komputer lokal (localhost) dan
**bukan** untuk kebutuhan production maupun multi-user.

------------------------------------------------------------------------

# Objectives

Membangun dashboard yang mampu:

-   Mengelola seluruh project lokal dari satu antarmuka.
-   Menjalankan project tanpa membuka terminal.
-   Menghentikan dan me-restart project.
-   Menampilkan log terminal secara realtime.
-   Memantau status setiap project.

------------------------------------------------------------------------

# Scope

-   Berjalan hanya di localhost.
-   Tidak memerlukan login.
-   Single user.
-   Tidak menggunakan cloud.
-   Tidak memerlukan deployment.

------------------------------------------------------------------------

# Root Workspace

Seluruh project berada pada satu folder utama.

Contoh:

``` text
Projects/
├── backend-aira/
├── frontend-aira/
├── api-dmsedu-id/
├── auto_article/
├── whatsapp_services/
├── ai_agent_lsp/
├── be-sertifikasi-lsp-dmi-ai/
└── ...
```

Dashboard harus membaca seluruh folder tersebut secara otomatis.

------------------------------------------------------------------------

# Functional Requirements

## 1. Automatic Project Discovery

-   Scan folder root saat aplikasi dijalankan.
-   Project baru otomatis muncul.
-   Tidak perlu mengubah source code ketika menambah project.

## 2. Project Information

Setiap project minimal menampilkan:

-   Nama project
-   Lokasi folder
-   Status (Running / Stopped)
-   Port (jika tersedia)
-   Jenis project (Node.js, Python, Vue, PHP, dll)

## 3. Start Project

Dashboard harus dapat menjalankan project sama seperti melalui terminal.

Contoh:

``` bash
npm run dev
python app.py
php artisan serve
```

Perintah start harus dapat dikonfigurasi dan tidak di-hardcode.

## 4. Stop Project

-   Menghentikan hanya process project.
-   Dashboard tetap berjalan.

## 5. Restart Project

Restart terdiri dari:

1.  Stop process lama.
2.  Menjalankan process baru.

## 6. Realtime Log Viewer

Fitur utama dashboard.

Harus menampilkan output terminal secara realtime tanpa refresh halaman.

Contoh:

``` text
Server Started
Connected MySQL
Connected Redis
GET /api/user
POST /login
Warning...
Error...
```

## 7. Auto Scroll

-   Otomatis mengikuti log terbaru.
-   Berhenti otomatis ketika user sedang membaca log lama.

## 8. Clear Log

Membersihkan tampilan log tanpa menghentikan process.

## 9. Project Status

Status harus selalu akurat.

-   🟢 Running
-   🔴 Stopped

## 10. Process Management

Simpan informasi process sehingga dapat:

-   Stop
-   Restart
-   Monitoring

------------------------------------------------------------------------

# Project Configuration

Setiap project sebaiknya memiliki file:

``` text
project.config.json
```

Contoh:

``` json
{
  "name": "Backend Aira",
  "type": "node",
  "start": "npm run dev",
  "port": 3000
}
```

Jika file tidak tersedia, sistem boleh mencoba mendeteksi secara
otomatis.

------------------------------------------------------------------------

# Dashboard Layout

## Sidebar

-   Daftar seluruh project
-   Status project
-   Search project

## Main Panel

Menampilkan:

-   Nama project
-   Lokasi folder
-   Status
-   Port
-   Tombol Start
-   Tombol Stop
-   Tombol Restart
-   Tombol Open Folder
-   Tombol Open Browser
-   Realtime Log Viewer

------------------------------------------------------------------------

# Monitoring

Jika memungkinkan tampilkan:

-   CPU Usage
-   Memory Usage
-   Uptime Process

------------------------------------------------------------------------

# Open Folder

Membuka folder project menggunakan File Explorer.

------------------------------------------------------------------------

# Open Browser

Jika project memiliki port, buka:

``` text
http://localhost:<PORT>
```

------------------------------------------------------------------------

# Suggested Technology Stack

## Frontend

-   Vue 3
-   Vite
-   Tailwind CSS

## Backend

-   Node.js
-   Express.js

## Realtime

-   Socket.IO

## Process Management

-   child_process
-   pidusage

------------------------------------------------------------------------

# Architecture

Frontend hanya sebagai UI.

Backend bertanggung jawab untuk:

-   Scan project
-   Menjalankan process
-   Menghentikan process
-   Restart process
-   Streaming log
-   Monitoring process

Frontend tidak menjalankan command secara langsung.

------------------------------------------------------------------------

# Suggested Folder Structure

``` text
src/
├── controllers/
├── routes/
├── services/
├── sockets/
├── process/
├── config/
├── utils/
└── logs/
```

Struktur harus modular dan mudah dikembangkan.

------------------------------------------------------------------------

# Non-Functional Requirements

-   Clean Code
-   Modular Architecture
-   Mudah di-maintain
-   Mudah menambah project baru
-   Mudah menambah jenis project baru
-   Reusable components
-   Scalable

------------------------------------------------------------------------

# Future Enhancements

-   Multiple Workspace
-   Start All Projects
-   Stop All Projects
-   Restart All Projects
-   Favorite Projects
-   Persistent Log History
-   Auto Start
-   Browser Terminal
-   Git Status
-   Git Pull / Push / Commit
-   Edit `.env`
-   Disk Usage Monitoring
-   Port Monitoring
-   Docker Compose Support
-   PM2 Support
-   Auto Restart ketika process crash
-   Notification System
-   Dark / Light Mode

------------------------------------------------------------------------

# Definition of Done

Project dianggap selesai apabila:

-   Dashboard mendeteksi seluruh project secara otomatis.
-   User dapat Start, Stop, dan Restart project.
-   Log tampil realtime seperti terminal.
-   Status project selalu sinkron.
-   Open Folder berfungsi.
-   Open Browser berfungsi.
-   Struktur kode modular.
-   Seluruh aplikasi berjalan sepenuhnya di lingkungan lokal.
