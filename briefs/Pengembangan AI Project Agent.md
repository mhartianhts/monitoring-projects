# Pengembangan AI Project Agent

## Tujuan

Kembangkan fitur AI pada aplikasi agar tidak hanya berfungsi sebagai chatbot, tetapi menjadi **AI Coding Agent yang memahami project yang sedang dipilih oleh user**.

Konsepnya dibuat menyerupai workflow tool seperti Claude Code/Cursor Agent, yaitu AI dapat memahami struktur project, membaca isi file yang relevan, menganalisis project, memberikan saran, melakukan perubahan pada file, dan menjalankan task yang diperlukan.

AI harus bekerja berdasarkan **project yang sedang dipilih**, bukan berdasarkan konteks percakapan saja.

---

# 1. Buat Halaman AI Agent Baru

Buat halaman khusus untuk AI Agent Project.

Jangan menjadikan halaman chatbot lama sebagai tempat utama untuk seluruh fitur baru ini apabila hal tersebut membuat struktur kode menjadi terlalu kompleks.

Halaman baru harus memiliki konsep **Project Workspace**.

Layout utama:

```text
┌─────────────────────────────────────────────────────────────┐
│ Project: my-project                         AI Agent        │
├──────────────────┬──────────────────────────────────────────┤
│                  │                                          │
│ PROJECT          │                                          │
│ EXPLORER         │              AI AGENT                    │
│                  │                                          │
│ 📁 src           │  Chat / Analysis / Task                  │
│ ├── components   │                                          │
│ ├── services     │                                          │
│ ├── pages        │                                          │
│ └── utils        │                                          │
│                  │                                          │
│ 📁 public        │                                          │
│ 📄 package.json  │                                          │
│ 📄 README.md     │                                          │
│                  │                                          │
│                  │                                          │
│                  ├──────────────────────────────────────────┤
│                  │ Ask AI...                         [Send]  │
└──────────────────┴──────────────────────────────────────────┘
```

Struktur layout boleh disesuaikan dengan desain aplikasi yang sudah ada, tetapi prinsip utamanya harus dipertahankan:

- Sidebar kiri = struktur project.
- Area utama = AI Agent.
- User dapat melihat project yang sedang digunakan.
- AI bekerja dalam konteks project tersebut.

---

# 2. Project Explorer

Tambahkan sidebar yang menampilkan struktur folder dan file dari project yang sedang dipilih.

Contoh:

```text
PROJECT EXPLORER

my-project
├── src
│   ├── components
│   │   ├── Button.tsx
│   │   └── Modal.tsx
│   ├── pages
│   │   ├── Dashboard.tsx
│   │   └── Login.tsx
│   ├── services
│   │   └── api.ts
│   └── App.tsx
├── public
├── package.json
├── README.md
└── .gitignore
```

Fitur minimum:

- Folder dapat di-expand/collapse.
- File dapat dipilih.
- Struktur project harus mengikuti kondisi aktual project.
- Jangan membuat struktur file secara hardcode.
- Struktur harus diambil dari filesystem/project yang sedang dipilih.
- File dan folder yang tidak relevan atau tidak aman untuk ditampilkan dapat difilter sesuai kebutuhan sistem.

Ketika user memilih sebuah file, tampilkan file tersebut sebagai konteks yang dapat digunakan AI.

---

# 3. AI Harus Memahami Project

AI Agent tidak boleh hanya menerima prompt user lalu langsung menjawab.

AI harus memiliki kemampuan untuk memahami context project.

Contoh user:

> "Kenapa halaman dashboard lambat?"

AI seharusnya dapat:

1. Melihat struktur project.
2. Mengidentifikasi file yang kemungkinan berkaitan dengan dashboard.
3. Membaca file yang relevan.
4. Menganalisis dependency dan alur kode.
5. Menjelaskan kemungkinan penyebab.
6. Memberikan rekomendasi perbaikan.
7. Jika diminta, melakukan perubahan.

AI tidak harus membaca seluruh project pada setiap request.

Gunakan pendekatan **context-aware / targeted file reading**.

Prioritaskan file yang relevan dengan permintaan user.

---

# 4. Kemampuan AI Agent

AI Agent harus dirancang agar memiliki kemampuan berikut.

### A. Analyze

AI dapat menganalisis:

- Struktur project.
- Arsitektur aplikasi.
- Relasi antar file.
- Dependency.
- Flow tertentu.
- Potensi bug.
- Potensi masalah performance.
- Code smell.
- Duplikasi kode.
- File yang tidak digunakan.
- Konfigurasi project.

Contoh:

> "Analisis struktur project ini dan jelaskan bagaimana flow authentication bekerja."

AI harus mencari file yang relevan dan menjelaskan flow berdasarkan kode aktual.

---

### B. Read

AI harus dapat membaca file project.

Contoh:

> "Baca implementasi authentication."

AI dapat mencari dan membaca file yang relevan, kemudian memberikan analisis.

AI harus menghindari membaca seluruh project tanpa alasan karena dapat menyebabkan context terlalu besar.

---

### C. Modify

AI dapat mengubah file project apabila user meminta.

Contoh:

> "Tambahkan loading state pada halaman Login."

AI harus:

1. Mencari implementasi Login.
2. Membaca file terkait.
3. Memahami implementasi yang sudah ada.
4. Menentukan file yang perlu diubah.
5. Melakukan perubahan.
6. Menjelaskan perubahan yang dilakukan.

Jangan melakukan perubahan terhadap file yang tidak relevan.

---

### D. Run Task

AI dapat menjalankan task yang diperlukan.

Contoh:

```text
npm test
npm run build
npm run lint
```

atau command lain yang memang tersedia pada project.

AI harus:

- Mengetahui command yang relevan dari project.
- Menjalankan command sesuai kebutuhan.
- Membaca output/error.
- Menganalisis error.
- Jika memungkinkan, memperbaiki masalah.
- Menjalankan kembali validasi setelah perubahan.

---

# 5. Agent Workflow

AI Agent sebaiknya menggunakan workflow seperti berikut:

```text
User Request
     ↓
Understand Request
     ↓
Inspect Project Structure
     ↓
Identify Relevant Files
     ↓
Read Relevant Files
     ↓
Analyze
     ↓
Determine Action
     ↓
┌───────────────┬───────────────┐
│ Answer        │ Modify Files  │
│               │       ↓       │
│               │ Run Task/Test │
└───────────────┴───────┬───────┘
                        ↓
                  Report Result
```

Jangan langsung melakukan perubahan hanya berdasarkan asumsi.

AI harus terlebih dahulu memahami kondisi project yang sebenarnya.

---

# 6. Tool-Based Architecture

AI Agent sebaiknya tidak diberikan akses filesystem secara bebas melalui satu fungsi besar.

Pisahkan kemampuan agent menjadi beberapa tool/action.

Minimal konsep tool:

```text
list_files
read_file
search_files
write_file
edit_file
run_command
```

Contoh:

```text
list_files
→ Melihat struktur folder/file

read_file
→ Membaca isi file tertentu

search_files
→ Mencari file atau kode berdasarkan keyword

write_file
→ Membuat atau menulis file

edit_file
→ Mengubah bagian tertentu dari file

run_command
→ Menjalankan command/project task
```

Agent kemudian menentukan tool mana yang diperlukan berdasarkan request user.

---

# 7. File Explorer dan AI Harus Terintegrasi

Project Explorer bukan hanya visualisasi.

File yang dipilih user harus dapat menjadi context AI.

Contoh:

User membuka:

```text
src/services/auth.ts
```

Kemudian bertanya:

> "Apakah implementasi ini aman?"

AI harus mengetahui bahwa `src/services/auth.ts` sedang dipilih dan dapat menggunakannya sebagai context utama.

Jika user memilih beberapa file, AI juga dapat menggunakan file-file tersebut sebagai context.

---

# 8. Perubahan File Harus Terlihat

Jangan membuat perubahan file secara diam-diam.

Ketika AI mengubah file, UI harus memberikan informasi:

```text
AI modified:

✓ src/pages/Login.tsx
✓ src/services/auth.ts
```

Idealnya user dapat melihat:

- File yang berubah.
- Bagian yang berubah.
- Diff sebelum/sesudah.
- Status perubahan.
- Hasil validation/test.

Contoh:

```text
Changes

src/pages/Login.tsx
+ Added loading state
+ Added error handling

src/services/auth.ts
+ Added request timeout
```

---

# 9. Command Execution

Jika AI menjalankan command, tampilkan aktivitasnya pada UI.

Contoh:

```text
Running:

npm run build

> my-project@1.0.0 build
> vite build

✓ Build completed successfully
```

Jika gagal:

```text
Running:

npm run build

✗ Build failed

Error:
src/pages/Login.tsx:42
Property 'loading' does not exist...
```

Output command harus dapat digunakan kembali oleh AI sebagai context untuk melakukan troubleshooting.

---

# 10. Agent Activity

Tambahkan indikator aktivitas AI agar user mengetahui apa yang sedang dilakukan.

Contoh:

```text
AI Agent

✓ Inspecting project structure
✓ Searching relevant files
✓ Reading src/pages/Dashboard.tsx
✓ Reading src/services/api.ts
● Analyzing dashboard performance
```

Hal ini penting karena proses agent dapat membutuhkan beberapa langkah.

User harus dapat memahami bahwa AI sedang:

- mencari file,
- membaca file,
- menganalisis,
- mengubah file,
- atau menjalankan command.

---

# 11. Chat History

Area chat tetap digunakan sebagai interface utama interaksi dengan AI.

Namun conversation harus memiliki context project.

Contoh:

```text
User:
Analisis authentication project ini.

AI:
Saya menemukan flow authentication melalui:

src/pages/Login.tsx
↓
src/services/auth.ts
↓
src/api/client.ts
↓
Backend authentication API

...
```

Percakapan berikutnya harus tetap memahami context selama masih berada pada project/session yang sama.

---

# 12. Context Management

Jangan memasukkan seluruh isi project ke prompt setiap kali user mengirim pesan.

Gunakan context secara bertahap:

```text
Project Structure
      ↓
User Request
      ↓
Relevant Files
      ↓
Selected Files
      ↓
Previous Agent Context
      ↓
LLM
```

Tujuannya:

- mengurangi token usage,
- meningkatkan relevansi context,
- menghindari context window terlalu penuh,
- membuat agent lebih cepat.

---

# 13. Safety / Permission

Operasi terhadap project harus memiliki batasan yang jelas.

Minimal bedakan:

### Read Operations

```text
list_files
read_file
search_files
```

Operasi ini relatif aman.

### Write Operations

```text
write_file
edit_file
delete_file
```

Operasi ini harus lebih berhati-hati.

### Execution Operations

```text
run_command
```

Command execution harus memiliki mekanisme pembatasan agar AI tidak dapat menjalankan command berbahaya secara sembarangan.

Jangan memberikan unrestricted shell access tanpa guardrail.

---

# 14. Jangan Mengubah Fitur Lama Secara Sembarangan

Sebelum melakukan implementasi:

1. Pelajari struktur project aplikasi saat ini.
2. Temukan implementasi halaman AI yang sudah ada.
3. Identifikasi routing.
4. Identifikasi mekanisme pemilihan project.
5. Identifikasi state management yang digunakan.
6. Identifikasi API/backend yang sudah tersedia.
7. Reuse component dan infrastructure yang masih relevan.

Jangan melakukan refactor besar terhadap fitur lama jika tidak diperlukan.

Jika terdapat implementasi yang dapat digunakan kembali, gunakan kembali daripada membuat duplikasi.

---

# 15. Tahapan Implementasi

Implementasi jangan langsung membuat seluruh kemampuan agent sekaligus.

Kerjakan secara bertahap.

### Phase 1 — AI Agent Workspace

Buat halaman baru:

- Project header.
- Project Explorer.
- AI Chat.
- Selected project context.

Belum perlu implementasi perubahan file.

### Phase 2 — Project Understanding

Implementasikan:

- list files.
- folder tree.
- file selection.
- read file.
- search files.

AI mulai dapat memahami struktur dan isi project.

### Phase 3 — Agent Tools

Tambahkan:

- read_file.
- search_files.
- edit_file.
- write_file.
- run_command.

AI mulai dapat bertindak terhadap project.

### Phase 4 — Agent Workflow

Implementasikan:

```text
Understand
→ Inspect
→ Read
→ Analyze
→ Act
→ Validate
→ Report
```

### Phase 5 — Developer Experience

Tambahkan:

- activity indicator.
- command output.
- diff viewer.
- changed files.
- error handling.
- cancel/stop agent.
- context management.

---

# 16. Acceptance Criteria

Fitur dianggap berhasil apabila:

- User dapat memilih sebuah project.
- User dapat membuka halaman AI Agent untuk project tersebut.
- Sidebar menampilkan struktur folder dan file project aktual.
- Folder dapat di-expand/collapse.
- User dapat memilih file.
- AI mengetahui project yang sedang aktif.
- AI dapat membaca file project.
- AI dapat mencari file/kode yang relevan.
- AI dapat menganalisis struktur project.
- AI dapat menjelaskan hubungan antar file berdasarkan kode aktual.
- AI dapat mengubah file ketika user meminta.
- Perubahan file dapat ditampilkan kepada user.
- AI dapat menjalankan task/project command yang diizinkan.
- Output command dapat dibaca kembali oleh AI.
- AI dapat melakukan troubleshooting berdasarkan error.
- Aktivitas agent dapat terlihat oleh user.
- AI tidak membaca seluruh project tanpa alasan.
- AI tidak mengubah file tanpa alasan yang jelas.
- Fitur AI/chat yang sudah ada tidak rusak.
- Project yang dipilih menjadi scope utama dari seluruh aktivitas agent.

---

# Definition of Done

Implementasi dinyatakan selesai apabila halaman AI Agent sudah berfungsi sebagai **workspace coding agent berbasis project**, bukan hanya sebagai chatbot.

User harus dapat melakukan workflow nyata seperti:

```text
Pilih Project
     ↓
Buka AI Agent
     ↓
Lihat struktur project
     ↓
Tanya AI tentang project
     ↓
AI mencari file relevan
     ↓
AI membaca kode
     ↓
AI memberikan analisis
     ↓
User meminta perubahan
     ↓
AI mengubah file
     ↓
AI menjalankan test/build
     ↓
AI melaporkan hasil
```

Prioritaskan **fondasi agent dan integrasi dengan project yang sebenarnya** terlebih dahulu. Jangan mengejar banyak fitur UI sebelum mekanisme project inspection, file access, tool execution, context management, dan agent workflow bekerja dengan benar.