<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import XtermInstance from "../components/terminal/XtermInstance.vue";
import { notify } from "../services/notification.service";
import { api } from "../services/api";

interface TerminalTab {
  id: string;
  name: string;
  projectId: string | null;
  cwd: string;
  shell: "powershell" | "cmd";
  status: "connecting" | "ready" | "exited";
  exitCode?: number;
}

type SplitMode = "single" | "vertical" | "horizontal";
type FocusedPane = "primary" | "secondary";

const route = useRoute();
const projectStore = useProjectStore();
const { projects, selected } = storeToRefs(projectStore);

const tabs = ref<TerminalTab[]>([]);
const activeTabId = ref<string>(""); // Primary Pane Tab ID
const secondaryTabId = ref<string | null>(null); // Secondary Pane Tab ID
const splitMode = ref<SplitMode>("single");
const focusedPane = ref<FocusedPane>("primary");

const termRefs = ref<Record<string, InstanceType<typeof XtermInstance> | null>>({});

// New Tab Form Modal / Popover State
const showNewTabMenu = ref(false);
const selectedProjectForNewTab = ref<string>("__ROOT__");
const selectedShellForNewTab = ref<"powershell" | "cmd">("powershell");

const quickMacros = [
  { label: "git status", cmd: "git status\r" },
  { label: "git diff", cmd: "git diff\r" },
  { label: "git branch", cmd: "git branch\r" },
  { label: "dir", cmd: "dir\r" },
  { label: "npm test", cmd: "npm test\r" },
  { label: "Clear (cls)", cmd: "cls\r" },
];

const activeTab = computed(() => {
  return tabs.value.find((t) => t.id === activeTabId.value) || null;
});

const secondaryTab = computed(() => {
  if (splitMode.value === "single" || !secondaryTabId.value) return null;
  return tabs.value.find((t) => t.id === secondaryTabId.value) || null;
});

const focusedTab = computed(() => {
  if (splitMode.value !== "single" && focusedPane.value === "secondary" && secondaryTab.value) {
    return secondaryTab.value;
  }
  return activeTab.value;
});

// Tabs partitioned for Pane 1 and Pane 2
const pane1Tabs = computed(() => {
  if (splitMode.value === "single") return tabs.value;
  return tabs.value.filter((t) => t.id !== secondaryTabId.value);
});

const pane2Tabs = computed(() => {
  if (splitMode.value === "single" || !secondaryTabId.value) return [];
  return tabs.value.filter((t) => t.id === secondaryTabId.value);
});

const saveTabsState = () => {
  try {
    const toSave = tabs.value.map((t) => ({
      id: t.id,
      name: t.name,
      projectId: t.projectId,
      cwd: t.cwd,
      shell: t.shell,
    }));
    localStorage.setItem("lpm_terminal_tabs", JSON.stringify(toSave));
    localStorage.setItem("lpm_terminal_active", activeTabId.value);
    localStorage.setItem("lpm_terminal_split_mode", splitMode.value);
    if (secondaryTabId.value) {
      localStorage.setItem("lpm_terminal_secondary_tab", secondaryTabId.value);
    } else {
      localStorage.removeItem("lpm_terminal_secondary_tab");
    }
  } catch {}
};

const setFocusedPane = (pane: FocusedPane) => {
  focusedPane.value = pane;
  const targetId = pane === "secondary" ? secondaryTabId.value : activeTabId.value;
  if (targetId && termRefs.value[targetId]) {
    termRefs.value[targetId]?.focus();
  }
};

const selectTabFromTopBar = (tabId: string) => {
  if (splitMode.value === "single") {
    activeTabId.value = tabId;
    focusedPane.value = "primary";
  } else {
    // If clicked tab is already in one of the panes, focus that pane
    if (tabId === activeTabId.value) {
      setFocusedPane("primary");
      return;
    }
    if (tabId === secondaryTabId.value) {
      setFocusedPane("secondary");
      return;
    }

    // Otherwise, assign to currently focused pane
    if (focusedPane.value === "secondary") {
      secondaryTabId.value = tabId;
    } else {
      activeTabId.value = tabId;
    }
  }

  saveTabsState();
  nextTick(() => {
    termRefs.value[tabId]?.fitTerminal();
    termRefs.value[tabId]?.focus();
  });
};

const onSelectPrimaryTab = (newId: string) => {
  if (splitMode.value !== "single" && newId === secondaryTabId.value) {
    // Swap primary and secondary
    const oldPrimary = activeTabId.value;
    activeTabId.value = newId;
    secondaryTabId.value = oldPrimary;
  } else {
    activeTabId.value = newId;
  }
  focusedPane.value = "primary";
  saveTabsState();
  nextTick(() => {
    termRefs.value[activeTabId.value]?.fitTerminal();
    termRefs.value[activeTabId.value]?.focus();
  });
};

const onSelectSecondaryTab = (newId: string) => {
  if (newId === activeTabId.value) {
    // Swap primary and secondary
    const oldSecondary = secondaryTabId.value;
    secondaryTabId.value = newId;
    activeTabId.value = oldSecondary || "";
  } else {
    secondaryTabId.value = newId;
  }
  focusedPane.value = "secondary";
  saveTabsState();
  nextTick(() => {
    if (secondaryTabId.value) {
      termRefs.value[secondaryTabId.value]?.fitTerminal();
      termRefs.value[secondaryTabId.value]?.focus();
    }
  });
};

const setSplitMode = (mode: SplitMode) => {
  splitMode.value = mode;

  if (mode !== "single") {
    // If no secondary tab yet or it's equal to primary, select or create another tab
    if (!secondaryTabId.value || secondaryTabId.value === activeTabId.value) {
      const other = tabs.value.find((t) => t.id !== activeTabId.value);
      if (other) {
        secondaryTabId.value = other.id;
      } else {
        // Auto-create a second tab for the split
        createTab({
          projectId: activeTab.value?.projectId,
          name: activeTab.value?.name ? `${activeTab.value.name} (Pane 2)` : undefined,
          shell: activeTab.value?.shell,
          cwd: activeTab.value?.cwd,
          asSecondary: true,
        });
      }
    }
  }

  saveTabsState();

  nextTick(() => {
    if (activeTabId.value) termRefs.value[activeTabId.value]?.fitTerminal();
    if (secondaryTabId.value) termRefs.value[secondaryTabId.value]?.fitTerminal();
    const currentId = focusedPane.value === "secondary" ? secondaryTabId.value : activeTabId.value;
    if (currentId) termRefs.value[currentId]?.focus();
  });
};

const closeSplit = () => {
  setSplitMode("single");
  focusedPane.value = "primary";
};

const createTab = (opts: {
  id?: string;
  projectId?: string | null;
  name?: string;
  shell?: "powershell" | "cmd";
  cwd?: string;
  asSecondary?: boolean;
} = {}) => {
  const sessionId = opts.id || `term_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  let tabName = opts.name;
  let targetProjectId = opts.projectId || null;
  let targetCwd = opts.cwd || "";

  if (targetProjectId && !targetCwd) {
    const proj = projects.value.find((p) => p.id === targetProjectId);
    if (proj) {
      tabName = tabName || proj.name;
      targetCwd = proj.path || "";
    }
  }

  if (!tabName) {
    tabName = `PowerShell ${tabs.value.length + 1}`;
  }

  const newTab: TerminalTab = {
    id: sessionId,
    name: tabName,
    projectId: targetProjectId,
    cwd: targetCwd,
    shell: opts.shell || "powershell",
    status: "connecting",
  };

  tabs.value.push(newTab);

  if (opts.asSecondary) {
    secondaryTabId.value = sessionId;
    focusedPane.value = "secondary";
  } else {
    activeTabId.value = sessionId;
    focusedPane.value = "primary";
  }

  showNewTabMenu.value = false;
  saveTabsState();

  nextTick(() => {
    const instance = termRefs.value[sessionId];
    if (instance) {
      instance.focus();
    }
  });
};

const closeTab = async (tabId: string, event?: Event) => {
  if (event) event.stopPropagation();

  const index = tabs.value.findIndex((t) => t.id === tabId);
  if (index === -1) return;

  // Kill backend session so it doesn't linger
  try {
    await api.killTerminalSession(tabId);
  } catch {}

  tabs.value.splice(index, 1);
  delete termRefs.value[tabId];

  // Handle closed secondary tab
  if (secondaryTabId.value === tabId) {
    const other = tabs.value.find((t) => t.id !== activeTabId.value);
    if (other) {
      secondaryTabId.value = other.id;
    } else {
      secondaryTabId.value = null;
      splitMode.value = "single";
      focusedPane.value = "primary";
    }
  }

  // Handle closed primary tab
  if (activeTabId.value === tabId) {
    if (secondaryTabId.value && tabs.value.some((t) => t.id === secondaryTabId.value)) {
      activeTabId.value = secondaryTabId.value;
      const other = tabs.value.find((t) => t.id !== activeTabId.value);
      secondaryTabId.value = other ? other.id : null;
      if (!secondaryTabId.value) {
        splitMode.value = "single";
      }
    } else if (tabs.value.length > 0) {
      const nextIndex = Math.max(0, index - 1);
      activeTabId.value = tabs.value[nextIndex].id;
    } else {
      createTab();
    }
  }

  if (tabs.value.length <= 1 && splitMode.value !== "single") {
    splitMode.value = "single";
    secondaryTabId.value = null;
    focusedPane.value = "primary";
  }

  saveTabsState();
  nextTick(() => {
    if (activeTabId.value) termRefs.value[activeTabId.value]?.fitTerminal();
    if (secondaryTabId.value) termRefs.value[secondaryTabId.value]?.fitTerminal();
  });
};

const onTabReady = (session: any, tab: TerminalTab) => {
  tab.status = "ready";
  if (session && session.cwd) {
    tab.cwd = session.cwd;
  }
};

const onTabExit = (exitCode: number, tab: TerminalTab) => {
  tab.status = "exited";
  tab.exitCode = exitCode;
};

const onTabTitle = (title: string, tab: TerminalTab) => {
  if (title && title.trim() && !tab.projectId) {
    // Optionally adapt title from shell
  }
};

const restartTargetTab = (targetId?: string) => {
  const id = targetId || focusedTab.value?.id || activeTabId.value;
  const target = tabs.value.find((t) => t.id === id);
  if (!target) return;

  const oldId = target.id;
  const newId = `term_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  target.id = newId;
  target.status = "connecting";
  target.exitCode = undefined;

  delete termRefs.value[oldId];

  if (activeTabId.value === oldId) {
    activeTabId.value = newId;
  }
  if (secondaryTabId.value === oldId) {
    secondaryTabId.value = newId;
  }

  saveTabsState();
  notify.toast(`Restarting terminal session...`, "info");
};

const runMacro = (cmd: string, targetId?: string) => {
  const id = targetId || focusedTab.value?.id || activeTabId.value;
  if (!id) return;
  const instance = termRefs.value[id];
  if (instance) {
    instance.sendInput(cmd);
    instance.focus();
  }
};

const sendCtrlC = (targetId?: string) => {
  const id = targetId || focusedTab.value?.id || activeTabId.value;
  if (!id) return;
  const instance = termRefs.value[id];
  if (instance) {
    instance.sendInterrupt();
    instance.focus();
  }
};

const clearCurrent = (targetId?: string) => {
  const id = targetId || focusedTab.value?.id || activeTabId.value;
  if (!id) return;
  const instance = termRefs.value[id];
  if (instance) {
    instance.clearScreen();
    instance.focus();
  }
};

const onAddNewTabFromMenu = () => {
  const isRoot = selectedProjectForNewTab.value === "__ROOT__";
  const projId = isRoot ? null : selectedProjectForNewTab.value;
  const proj = projects.value.find((p) => p.id === projId);
  const name = proj ? proj.name : "Workspace Root";
  createTab({
    projectId: projId,
    name,
    shell: selectedShellForNewTab.value,
  });
};

onMounted(async () => {
  try {
    // 1. Ambil session yang masih berjalan di backend
    const activeSessions = await api.getTerminalSessions();

    // 2. Baca metadata tab tersimpan dari localStorage
    let savedTabs: Array<{
      id: string;
      name: string;
      projectId: string | null;
      cwd: string;
      shell: "powershell" | "cmd";
    }> = [];
    const raw = localStorage.getItem("lpm_terminal_tabs");
    if (raw) {
      try {
        savedTabs = JSON.parse(raw);
      } catch {}
    }

    // 3. Re-attach sesi yang masih hidup di backend
    if (activeSessions && activeSessions.length > 0) {
      const restored: TerminalTab[] = [];
      for (const s of activeSessions) {
        const saved = savedTabs.find((t) => t.id === s.id);
        const proj = s.projectId ? projects.value.find((p) => p.id === s.projectId) : null;
        restored.push({
          id: s.id,
          name: saved?.name || proj?.name || `PowerShell (${s.id.slice(-4)})`,
          projectId: s.projectId || null,
          cwd: s.cwd || "",
          shell: (s.shell as any) || "powershell",
          status: "connecting",
        });
      }

      if (restored.length > 0) {
        tabs.value = restored;
        const savedActive = localStorage.getItem("lpm_terminal_active");
        if (savedActive && restored.some((t) => t.id === savedActive)) {
          activeTabId.value = savedActive;
        } else {
          activeTabId.value = restored[0].id;
        }

        // Restore split preference if available
        const savedSplit = localStorage.getItem("lpm_terminal_split_mode");
        const savedSec = localStorage.getItem("lpm_terminal_secondary_tab");
        if (
          (savedSplit === "vertical" || savedSplit === "horizontal") &&
          savedSec &&
          restored.some((t) => t.id === savedSec) &&
          savedSec !== activeTabId.value
        ) {
          splitMode.value = savedSplit;
          secondaryTabId.value = savedSec;
        }

        saveTabsState();
        return;
      }
    }
  } catch (err) {
    console.warn("[terminal] Error checking active sessions:", err);
  }

  // Check if project query parameter is present in route
  const targetProjId = (route.query.project as string) || selected.value?.id || null;
  if (targetProjId) {
    const proj = projects.value.find((p) => p.id === targetProjId);
    if (proj) {
      createTab({
        projectId: proj.id,
        name: proj.name,
      });
      return;
    }
  }

  // Otherwise default initial tab
  createTab();
});
</script>

<template>
  <div class="h-full flex-1 flex flex-col min-w-0 w-full bg-[#050811] overflow-hidden">
    <!-- Top Action & Tab Navigation Bar -->
    <div class="border-b border-line bg-panel/90 px-3 py-2 flex items-center justify-between gap-3 shrink-0 select-none">
      <!-- Tabs List -->
      <div class="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none flex-1">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-mono transition cursor-pointer shrink-0"
          :class="[
            activeTabId === tab.id
              ? 'bg-[#080c14] border-accent/60 text-accent font-semibold shadow-xs'
              : secondaryTabId === tab.id && splitMode !== 'single'
                ? 'bg-[#080c14] border-indigo-500/60 text-indigo-400 font-semibold shadow-xs'
                : 'border-line/70 bg-elevated/40 text-muted hover:text-ink hover:bg-elevated'
          ]"
          @click="selectTabFromTopBar(tab.id)"
        >
          <!-- Status Dot -->
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :class="{
              'bg-emerald-400 animate-pulse-subtle': tab.status === 'ready',
              'bg-amber-400 animate-pulse': tab.status === 'connecting',
              'bg-rose-500': tab.status === 'exited',
            }"
            :title="`Status: ${tab.status}`"
          />

          <!-- Tab Label -->
          <span class="truncate max-w-[130px] text-xs">
            {{ tab.name }}
          </span>

          <!-- Split Pane Allocation Badge -->
          <span
            v-if="splitMode !== 'single' && activeTabId === tab.id"
            class="rounded bg-accent/20 text-accent border border-accent/40 px-1 py-0.2 text-[9px] font-bold"
          >
            P1
          </span>
          <span
            v-else-if="splitMode !== 'single' && secondaryTabId === tab.id"
            class="rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 px-1 py-0.2 text-[9px] font-bold"
          >
            P2
          </span>

          <!-- Shell Badge -->
          <span class="rounded bg-base px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted font-bold">
            {{ tab.shell === 'cmd' ? 'CMD' : 'PS' }}
          </span>

          <!-- Close Tab Button -->
          <button
            type="button"
            class="rounded p-0.5 text-muted hover:text-rose-400 hover:bg-base/60 transition opacity-60 group-hover:opacity-100"
            title="Tutup tab"
            @click="closeTab(tab.id, $event)"
          >
            ✕
          </button>
        </div>

        <!-- Add Tab Trigger Button -->
        <div class="relative shrink-0">
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-line hover:border-accent/40 transition"
            title="Buka Tab Terminal Baru"
            @click="showNewTabMenu = !showNewTabMenu"
          >
            <span>+</span>
            <span class="text-[11px]">New Tab</span>
          </button>

          <!-- New Tab Settings Dropdown -->
          <div
            v-if="showNewTabMenu"
            class="absolute left-0 top-full mt-2 z-50 w-72 rounded-xl border border-line bg-panel p-3 shadow-2xl space-y-3"
          >
            <div class="flex items-center justify-between border-b border-line pb-2">
              <span class="text-xs font-bold text-ink">Buka Terminal Baru</span>
              <button
                type="button"
                class="text-xs text-muted hover:text-ink font-bold"
                @click="showNewTabMenu = false"
              >
                ✕
              </button>
            </div>

            <div class="space-y-1.5">
              <label class="text-[10px] font-bold uppercase tracking-wider text-muted">Folder / Project Target</label>
              <select
                v-model="selectedProjectForNewTab"
                class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs font-mono text-ink outline-none"
              >
                <option value="__ROOT__">📁 Workspace Root (D:\mhartian\project)</option>
                <option
                  v-for="proj in projects"
                  :key="proj.id"
                  :value="proj.id"
                >
                  ⚡ {{ proj.name }} ({{ proj.type }})
                </option>
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="text-[10px] font-bold uppercase tracking-wider text-muted">Pilihan Shell</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-lg border px-2 py-1.5 text-xs font-semibold transition"
                  :class="selectedShellForNewTab === 'powershell' ? 'bg-accent/20 border-accent text-accent font-bold' : 'border-line bg-base text-muted hover:text-ink'"
                  @click="selectedShellForNewTab = 'powershell'"
                >
                  PowerShell
                </button>
                <button
                  type="button"
                  class="rounded-lg border px-2 py-1.5 text-xs font-semibold transition"
                  :class="selectedShellForNewTab === 'cmd' ? 'bg-accent/20 border-accent text-accent font-bold' : 'border-line bg-base text-muted hover:text-ink'"
                  @click="selectedShellForNewTab = 'cmd'"
                >
                  CMD
                </button>
              </div>
            </div>

            <button
              type="button"
              class="w-full rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-110 transition"
              @click="onAddNewTabFromMenu"
            >
              Spawn Terminal
            </button>
          </div>
        </div>
      </div>

      <!-- Right Action Utilities (Split screen toggles + Macros) -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Split Mode Toggle Button Group -->
        <div class="flex items-center rounded-lg border border-line bg-elevated/80 p-0.5 gap-0.5">
          <button
            type="button"
            class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition"
            :class="
              splitMode === 'single'
                ? 'bg-accent text-white shadow-xs'
                : 'text-muted hover:text-ink hover:bg-line/50'
            "
            title="Layar Penuh (Single Pane)"
            @click="setSplitMode('single')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="2" width="12" height="12" rx="2" />
            </svg>
            <span class="hidden xl:inline text-[11px]">Single</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition"
            :class="
              splitMode === 'vertical'
                ? 'bg-accent text-white shadow-xs'
                : 'text-muted hover:text-ink hover:bg-line/50'
            "
            title="Split Vertikal (2 Kolom Bersandingan)"
            @click="setSplitMode('vertical')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <line x1="8" y1="2" x2="8" y2="14" />
            </svg>
            <span class="hidden xl:inline text-[11px]">Vertical</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition"
            :class="
              splitMode === 'horizontal'
                ? 'bg-accent text-white shadow-xs'
                : 'text-muted hover:text-ink hover:bg-line/50'
            "
            title="Split Horizontal (2 Baris Atas-Bawah)"
            @click="setSplitMode('horizontal')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <line x1="2" y1="8" x2="14" y2="8" />
            </svg>
            <span class="hidden xl:inline text-[11px]">Horizontal</span>
          </button>
        </div>

        <div class="h-4 w-px bg-line/80 mx-0.5" />

        <!-- Quick Terminal Action Shortcuts -->
        <button
          type="button"
          class="flex items-center gap-1 rounded-md border border-line bg-elevated px-2 py-1 text-xs font-medium text-ink hover:bg-line transition"
          :title="`Kirim Ctrl+C ke pane aktif (${focusedPane === 'primary' ? 'Pane 1' : 'Pane 2'})`"
          @click="sendCtrlC()"
        >
          <span class="font-mono text-accent font-bold">^C</span>
          <span class="hidden md:inline text-[11px]">Break</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1 rounded-md border border-line bg-elevated px-2 py-1 text-xs font-medium text-ink hover:bg-line transition"
          :title="`Clear screen pane aktif (${focusedPane === 'primary' ? 'Pane 1' : 'Pane 2'})`"
          @click="clearCurrent()"
        >
          <span>🧹</span>
          <span class="hidden md:inline text-[11px]">Clear</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1 rounded-md border border-line bg-elevated px-2 py-1 text-xs font-medium text-ink hover:bg-line transition"
          :title="`Restart session terminal aktif (${focusedPane === 'primary' ? 'Pane 1' : 'Pane 2'})`"
          @click="restartTargetTab()"
        >
          <span>🔄</span>
          <span class="hidden md:inline text-[11px]">Restart</span>
        </button>
      </div>
    </div>

    <!-- Quick Macros Toolbar Strip -->
    <div class="border-b border-line/60 bg-[#080c14] px-3 py-1.5 flex items-center justify-between gap-2 shrink-0 overflow-x-auto">
      <div class="flex items-center gap-1.5 text-[11px] overflow-x-auto scrollbar-none">
        <span class="text-[9px] font-bold uppercase tracking-wider text-muted font-mono shrink-0">Macros:</span>
        <button
          v-for="macro in quickMacros"
          :key="macro.label"
          type="button"
          class="rounded border border-line/70 bg-elevated/50 px-2 py-0.5 font-mono text-[10px] text-muted hover:text-accent hover:border-accent/40 hover:bg-elevated transition shrink-0"
          :title="`Jalankan '${macro.label}' pada ${focusedPane === 'primary' ? 'Pane 1' : 'Pane 2'}`"
          @click="runMacro(macro.cmd)"
        >
          {{ macro.label }}
        </button>
      </div>

      <div class="flex items-center gap-2 text-[10px] font-mono text-muted shrink-0 pl-2">
        <span v-if="focusedTab?.cwd" class="truncate max-w-[280px] lg:max-w-md" :title="`Directory: ${focusedTab.cwd}`">
          📂 {{ focusedTab.cwd }}
        </span>
        <span class="text-muted/40">|</span>
        <span
          class="font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-[9px]"
          :class="focusedPane === 'primary' ? 'bg-accent/20 text-accent' : 'bg-indigo-500/20 text-indigo-400'"
        >
          TARGET: {{ focusedPane === 'primary' ? 'PANE 1' : 'PANE 2' }}
        </span>
      </div>
    </div>

    <!-- Main Terminal Container Display (Split / Single) -->
    <div
      class="flex-1 flex min-h-0 min-w-0 w-full bg-[#080c14] overflow-hidden"
      :class="{
        'flex-row divide-x divide-line': splitMode === 'vertical',
        'flex-col divide-y divide-line': splitMode === 'horizontal',
      }"
    >
      <!-- PRIMARY PANE (Pane 1) -->
      <div
        class="flex-1 flex flex-col min-h-0 min-w-0 h-full w-full relative transition-all overflow-hidden"
        :class="[
          splitMode !== 'single' && focusedPane === 'primary'
            ? 'ring-1 ring-inset ring-accent/60'
            : ''
        ]"
        @click="setFocusedPane('primary')"
      >
        <!-- Pane 1 Subheader (Only shown when in Split Mode) -->
        <div
          v-if="splitMode !== 'single'"
          class="border-b border-line px-3 py-1 flex items-center justify-between gap-2 shrink-0 select-none transition-colors"
          :class="focusedPane === 'primary' ? 'bg-[#0d1524]' : 'bg-[#060a12]'"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 transition"
              :class="focusedPane === 'primary' ? 'bg-accent text-white font-bold' : 'bg-line/60 text-muted'"
            >
              PANE 1 {{ focusedPane === 'primary' ? '• ACTIVE' : '' }}
            </span>

            <!-- Tab Dropdown Switcher for Pane 1 -->
            <select
              :value="activeTabId"
              class="bg-base border border-line rounded px-2 py-0.5 text-xs font-mono text-ink outline-none cursor-pointer hover:border-accent/40 max-w-[200px] truncate"
              @change="onSelectPrimaryTab(($event.target as HTMLSelectElement).value)"
              @click.stop
            >
              <option
                v-for="t in tabs"
                :key="t.id"
                :value="t.id"
              >
                {{ t.name }} ({{ t.shell === 'cmd' ? 'CMD' : 'PS' }}) {{ t.id === secondaryTabId ? '⇄ [P2]' : '' }}
              </option>
            </select>

            <span v-if="activeTab?.cwd" class="hidden md:inline text-[10px] font-mono text-muted truncate max-w-[220px]" :title="activeTab.cwd">
              📂 {{ activeTab.cwd }}
            </span>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="px-1.5 py-0.5 rounded text-muted hover:text-accent hover:bg-base text-[10px] font-mono transition"
              title="Kirim Ctrl+C ke Pane 1"
              @click.stop="sendCtrlC(activeTabId)"
            >
              ^C
            </button>
            <button
              type="button"
              class="px-1.5 py-0.5 rounded text-muted hover:text-ink hover:bg-base text-[10px] font-mono transition"
              title="Clear Pane 1"
              @click.stop="clearCurrent(activeTabId)"
            >
              Clear
            </button>
            <button
              type="button"
              class="px-1.5 py-0.5 rounded text-muted hover:text-ink hover:bg-base text-[10px] font-mono transition"
              title="Restart Pane 1"
              @click.stop="restartTargetTab(activeTabId)"
            >
              🔄
            </button>
          </div>
        </div>

        <!-- Pane 1 Terminal Canvas Area -->
        <div class="flex-1 relative min-h-0 min-w-0 w-full h-full bg-[#080c14] overflow-hidden">
          <div
            v-for="tab in pane1Tabs"
            :key="tab.id"
            v-show="activeTabId === tab.id"
            class="h-full w-full absolute inset-0 flex flex-col"
          >
            <XtermInstance
              :ref="(el) => { termRefs[tab.id] = el as InstanceType<typeof XtermInstance> }"
              :session-id="tab.id"
              :project-id="tab.projectId"
              :cwd="tab.cwd"
              :shell="tab.shell"
              :active="activeTabId === tab.id && (splitMode === 'single' || focusedPane === 'primary')"
              @ready="(session) => onTabReady(session, tab)"
              @exit="(code) => onTabExit(code, tab)"
              @title="(title) => onTabTitle(title, tab)"
            />
          </div>
        </div>
      </div>

      <!-- SECONDARY PANE (Pane 2) -->
      <div
        v-if="splitMode !== 'single' && secondaryTabId"
        class="flex-1 flex flex-col min-h-0 min-w-0 h-full w-full relative transition-all overflow-hidden"
        :class="[
          focusedPane === 'secondary'
            ? 'ring-1 ring-inset ring-indigo-500/70'
            : ''
        ]"
        @click="setFocusedPane('secondary')"
      >
        <!-- Pane 2 Subheader -->
        <div
          class="border-b border-line px-3 py-1 flex items-center justify-between gap-2 shrink-0 select-none transition-colors"
          :class="focusedPane === 'secondary' ? 'bg-[#101426]' : 'bg-[#060a12]'"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 transition"
              :class="focusedPane === 'secondary' ? 'bg-indigo-600 text-white font-bold' : 'bg-line/60 text-muted'"
            >
              PANE 2 {{ focusedPane === 'secondary' ? '• ACTIVE' : '' }}
            </span>

            <!-- Tab Dropdown Switcher for Pane 2 -->
            <select
              :value="secondaryTabId"
              class="bg-base border border-line rounded px-2 py-0.5 text-xs font-mono text-ink outline-none cursor-pointer hover:border-indigo-500/40 max-w-[200px] truncate"
              @change="onSelectSecondaryTab(($event.target as HTMLSelectElement).value)"
              @click.stop
            >
              <option
                v-for="t in tabs"
                :key="t.id"
                :value="t.id"
              >
                {{ t.name }} ({{ t.shell === 'cmd' ? 'CMD' : 'PS' }}) {{ t.id === activeTabId ? '⇄ [P1]' : '' }}
              </option>
            </select>

            <span v-if="secondaryTab?.cwd" class="hidden md:inline text-[10px] font-mono text-muted truncate max-w-[220px]" :title="secondaryTab.cwd">
              📂 {{ secondaryTab.cwd }}
            </span>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="px-1.5 py-0.5 rounded text-muted hover:text-indigo-400 hover:bg-base text-[10px] font-mono transition"
              title="Kirim Ctrl+C ke Pane 2"
              @click.stop="sendCtrlC(secondaryTabId)"
            >
              ^C
            </button>
            <button
              type="button"
              class="px-1.5 py-0.5 rounded text-muted hover:text-ink hover:bg-base text-[10px] font-mono transition"
              title="Clear Pane 2"
              @click.stop="clearCurrent(secondaryTabId)"
            >
              Clear
            </button>
            <button
              type="button"
              class="px-1.5 py-0.5 rounded text-muted hover:text-ink hover:bg-base text-[10px] font-mono transition"
              title="Restart Pane 2"
              @click.stop="restartTargetTab(secondaryTabId)"
            >
              🔄
            </button>
            <button
              type="button"
              class="px-1.5 py-0.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 text-[10px] font-semibold transition ml-1"
              title="Tutup Split Screen (Kembali ke 1 Pane)"
              @click.stop="closeSplit"
            >
              ✕ Close Split
            </button>
          </div>
        </div>

        <!-- Pane 2 Terminal Canvas Area -->
        <div class="flex-1 relative min-h-0 min-w-0 w-full h-full bg-[#080c14] overflow-hidden">
          <div
            v-for="tab in pane2Tabs"
            :key="tab.id"
            v-show="secondaryTabId === tab.id"
            class="h-full w-full absolute inset-0 flex flex-col"
          >
            <XtermInstance
              :ref="(el) => { termRefs[tab.id] = el as InstanceType<typeof XtermInstance> }"
              :session-id="tab.id"
              :project-id="tab.projectId"
              :cwd="tab.cwd"
              :shell="tab.shell"
              :active="secondaryTabId === tab.id && focusedPane === 'secondary'"
              @ready="(session) => onTabReady(session, tab)"
              @exit="(code) => onTabExit(code, tab)"
              @title="(title) => onTabTitle(title, tab)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Status Bar -->
    <div class="border-t border-line/60 bg-[#050811] px-4 py-1 text-[10px] font-mono text-muted flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="focusedTab?.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'"
          />
          {{ focusedTab?.status === 'ready' ? 'Interactive Shell Connected' : 'Connecting Session...' }}
        </span>
        <span v-if="focusedTab?.exitCode !== undefined" class="text-rose-400 font-bold">
          Exit: {{ focusedTab.exitCode }}
        </span>
      </div>
      <div class="flex items-center gap-4 text-muted/80">
        <span>Mode: <strong class="text-ink uppercase">{{ splitMode === 'single' ? 'Single Pane' : splitMode === 'vertical' ? 'Dual (Vertical)' : 'Dual (Horizontal)' }}</strong></span>
        <span>Active: <strong class="text-accent">{{ focusedPane === 'primary' ? 'Pane 1' : 'Pane 2' }}</strong></span>
        <span>Paste: <kbd class="rounded bg-elevated px-1 text-[9px] text-ink">Ctrl+V</kbd></span>
        <span class="text-accent font-semibold">Web Terminal Pro</span>
      </div>
    </div>
  </div>
</template>

