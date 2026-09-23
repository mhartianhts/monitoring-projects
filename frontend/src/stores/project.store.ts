import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import { getSocket } from "../composables/useSocket";
import type {
  EditorInfo,
  GitStatus,
  LogEntry,
  Project,
} from "../types/project";

const STORAGE_KEY_SELECTED_PROJECT = "monitoring_selected_project_id";

const getSavedProjectId = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY_SELECTED_PROJECT);
  } catch {
    return null;
  }
};

const saveProjectId = (id: string | null) => {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY_SELECTED_PROJECT, id);
    } else {
      localStorage.removeItem(STORAGE_KEY_SELECTED_PROJECT);
    }
  } catch {
    // Ignore localStorage errors
  }
};

export const useProjectStore = defineStore("project", () => {
  const projects = ref<Project[]>([]);
  const selectedId = ref<string | null>(getSavedProjectId());
  const search = ref("");
  const loading = ref(false);
  const actionLoading = ref(false);
  const bulkLoading = ref(false);
  const gitLoading = ref(false);
  const error = ref<string | null>(null);
  const gitMessage = ref<string | null>(null);
  const logs = ref<LogEntry[]>([]);
  const gitStatus = ref<GitStatus | null>(null);
  const editors = ref<EditorInfo[]>([]);
  const showProjectSidebar = ref(true);
  let socketBound = false;
  const availableEditors = computed(() =>
    editors.value.filter((editor) => editor.available),
  );

  const toggleProjectSidebar = () => {
    showProjectSidebar.value = !showProjectSidebar.value;
  };

  const selected = computed(
    () => projects.value.find((p) => p.id === selectedId.value) || null,
  );

  const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    const list = q
      ? projects.value.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q) ||
            p.type.toLowerCase().includes(q),
        )
      : [...projects.value];

    return list.sort((a, b) => {
      const af = a.favorite ? 0 : 1;
      const bf = b.favorite ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
  });

  const upsert = (project: Project) => {
    const idx = projects.value.findIndex((p) => p.id === project.id);
    if (idx >= 0) projects.value[idx] = project;
    else projects.value.push(project);
  };

  const bindSocket = () => {
    if (socketBound) return;
    socketBound = true;
    const socket = getSocket();

    socket.on("project:status", ({ projectId, status, pid }) => {
      const target = projects.value.find((p) => p.id === projectId);
      if (!target) return;
      target.status = status;
      target.pid = pid;
      if (status === "stopped") {
        target.stats = { cpu: 0, memory: 0, uptime: 0 };
      }
    });

    socket.on("project:stats", ({ projectId, cpu, memory, uptime }) => {
      const target = projects.value.find((p) => p.id === projectId);
      if (!target) return;
      target.stats = { cpu, memory, uptime };
    });

    socket.on("log:line", (entry: LogEntry & { projectId: string }) => {
      if (entry.projectId !== selectedId.value) return;
      logs.value.push({ line: entry.line, stream: entry.stream, ts: entry.ts });
      if (logs.value.length > 2000)
        logs.value.splice(0, logs.value.length - 2000);
    });

    socket.on("log:clear", ({ projectId }) => {
      if (projectId === selectedId.value) logs.value = [];
    });

    socket.on("log:snapshot", ({ projectId, logs: snapshot }) => {
      if (projectId === selectedId.value) logs.value = snapshot;
    });
  };

  const fetchGitStatus = async (id = selectedId.value) => {
    if (!id) return;
    try {
      gitStatus.value = await api.gitStatus(id);
    } catch (err) {
      gitStatus.value = {
        isRepo: false,
        branch: null,
        branches: [],
        dirty: false,
        ahead: 0,
        behind: 0,
        changedFiles: [],
        remote: null,
      };
      error.value =
        err instanceof Error ? err.message : "Failed to load git status";
    }
  };

  const runGitAction = async (
    action: () => Promise<GitStatus>,
    successMessage: string,
  ) => {
    if (!selectedId.value) return;
    gitLoading.value = true;
    error.value = null;
    gitMessage.value = null;
    try {
      gitStatus.value = await action();
      gitMessage.value = successMessage;
      notify.toast(successMessage, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Git action failed";
      error.value = msg;
      notify.error("Gagal Git", msg);
    } finally {
      gitLoading.value = false;
    }
  };

  const fetchProjects = async () => {
    loading.value = true;
    error.value = null;
    try {
      projects.value = await api.listProjects();
      if (projects.value.length > 0) {
        const preferredId = selectedId.value || getSavedProjectId();
        const matched = projects.value.find((p) => p.id === preferredId);
        const targetId = matched ? matched.id : projects.value[0].id;
        await selectProject(targetId);
      } else {
        selectedId.value = null;
        saveProjectId(null);
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to load projects";
    } finally {
      loading.value = false;
    }
  };

  const fetchEditors = async (refresh = false) => {
    try {
      editors.value = await api.listEditors(refresh);
    } catch {
      editors.value = [];
    }
  };

  const selectProject = async (id: string) => {
    selectedId.value = id;
    saveProjectId(id);
    logs.value = [];
    gitMessage.value = null;
    gitStatus.value = null;
    getSocket().emit("subscribe:project", { projectId: id });
    try {
      const fresh = await api.getProject(id);
      upsert(fresh);
      logs.value = await api.getLogs(id);
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to select project";
    }
  };

  const runAction = async (action: "start" | "stop" | "restart") => {
    if (!selectedId.value) return;
    actionLoading.value = true;
    error.value = null;
    try {
      const updated = await api[action](selectedId.value);
      upsert(updated);
      const actionLabel = action === "start" ? "dijalankan" : action === "stop" ? "dihentikan" : "di-restart";
      notify.toast(`Proyek ${updated.name} ${actionLabel}`, "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      error.value = msg;
      notify.error("Gagal Memproses Proyek", msg);
    } finally {
      actionLoading.value = false;
    }
  };

  const runBulkAction = async (
    action: "startAll" | "stopAll" | "restartAll",
  ) => {
    if (action === "stopAll" || action === "restartAll") {
      const title = action === "stopAll" ? "Hentikan Semua Proyek" : "Restart Semua Proyek";
      const text = action === "stopAll" ? "Apakah Anda yakin ingin menghentikan seluruh proyek aktif?" : "Apakah Anda yakin ingin me-restart seluruh proyek aktif?";
      const confirmed = await notify.confirm(title, text, "Ya, Lanjutkan", "Batal");
      if (!confirmed) return;
    }
    bulkLoading.value = true;
    error.value = null;
    try {
      const data = await api[action]();
      projects.value = data.projects;
      const failed = data.results.filter((r) => !r.ok);
      if (failed.length > 0) {
        const msg = `${failed.length} project gagal: ${failed.map((r) => r.id).join(", ")}`;
        error.value = msg;
        notify.warning("Perhatian", msg);
      } else {
        const label = action === "startAll" ? "Seluruh proyek dijalankan" : action === "stopAll" ? "Seluruh proyek dihentikan" : "Seluruh proyek di-restart";
        notify.toast(label, "success");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk action failed";
      error.value = msg;
      notify.error("Tindakan Massal Gagal", msg);
    } finally {
      bulkLoading.value = false;
    }
  };

  const openFolder = async () => {
    if (!selectedId.value) return;
    await api.openFolder(selectedId.value);
  };

  const openBrowser = async () => {
    if (!selectedId.value) return;
    await api.openBrowser(selectedId.value);
  };

  const openEditor = async (editorId: string) => {
    if (!selectedId.value) return;
    error.value = null;
    try {
      await api.openEditor(selectedId.value, editorId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open editor";
      error.value = msg;
      notify.error("Gagal Membuka Editor", msg);
    }
  };

  const clearLogs = async () => {
    if (!selectedId.value) return;
    await api.clearLogs(selectedId.value);
    logs.value = [];
    notify.toast("Log tampilan dibersihkan", "info");
  };

  const toggleFavorite = async (id: string) => {
    error.value = null;
    try {
      const updated = await api.toggleFavorite(id);
      upsert(updated);
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to update favorite";
    }
  };

  const createBranch = async (name: string) => {
    if (!selectedId.value) return;
    await runGitAction(
      () => api.gitCreateBranch(selectedId.value!, name),
      `Branch dibuat & checkout: ${name}`,
    );
  };

  const checkout = async (name: string) => {
    if (!selectedId.value) return;
    await runGitAction(
      () => api.gitCheckout(selectedId.value!, name),
      `Pindah ke branch: ${name}`,
    );
  };

  const gitAdd = async () => {
    if (!selectedId.value) return;
    await runGitAction(
      () => api.gitAdd(selectedId.value!),
      "git add -A selesai",
    );
  };

  const gitCommit = async (message: string) => {
    if (!selectedId.value) return;
    await runGitAction(
      () => api.gitCommit(selectedId.value!, message),
      "Commit berhasil",
    );
  };

  const gitPull = async () => {
    if (!selectedId.value) return;
    await runGitAction(() => api.gitPull(selectedId.value!), "Pull berhasil");
  };

  const gitPush = async () => {
    if (!selectedId.value) return;
    await runGitAction(() => api.gitPush(selectedId.value!), "Push berhasil");
  };

  return {
    projects,
    selectedId,
    selected,
    search,
    filtered,
    loading,
    actionLoading,
    bulkLoading,
    gitLoading,
    error,
    gitMessage,
    logs,
    gitStatus,
    editors,
    availableEditors,
    showProjectSidebar,
    toggleProjectSidebar,
    bindSocket,
    fetchProjects,
    fetchEditors,
    selectProject,
    runAction,
    runBulkAction,
    openFolder,
    openBrowser,
    openEditor,
    clearLogs,
    toggleFavorite,
    fetchGitStatus,
    createBranch,
    checkout,
    gitAdd,
    gitCommit,
    gitPull,
    gitPush,
  };
});
