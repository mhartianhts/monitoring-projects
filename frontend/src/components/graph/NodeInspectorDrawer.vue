<script setup lang="ts">
import { ref, watch } from "vue";
import { useCodeGraphStore } from "../../stores/codeGraph.store";
import { api } from "../../services/api";

const store = useCodeGraphStore();

const fileContent = ref<string | null>(null);
const fileLoading = ref(false);
const showCodePreview = ref(false);

const layerBadge = (layer: string) => {
  switch (layer) {
    case "route":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "controller":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "service":
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "model":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "middleware":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "component":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    case "store":
      return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
    default:
      return "bg-gray-500/15 text-gray-400 border-gray-500/30";
  }
};

const fetchFileSnippet = async () => {
  if (!store.graphData?.projectId || !store.selectedNode?.relPath) return;
  fileLoading.value = true;
  try {
    const data = await api.readProjectFile(
      store.graphData.projectId,
      store.selectedNode.relPath
    );
    fileContent.value = data.content || "(File kosong)";
  } catch {
    fileContent.value = "// Tidak dapat membaca preview file";
  } finally {
    fileLoading.value = false;
  }
};

watch(
  () => store.selectedNodeId,
  () => {
    fileContent.value = null;
    showCodePreview.value = false;
  }
);
</script>

<template>
  <div class="flex h-full flex-col border-l border-line bg-panel overflow-hidden w-80 md:w-96 shrink-0">
    <div v-if="!store.selectedNode" class="flex h-full items-center justify-center p-8 text-center text-xs text-muted">
      Pilih node pada graf arsitektur untuk memeriksa detail komponen dan relasi dependensinya.
    </div>

    <template v-else>
      <!-- Header -->
      <div class="border-b border-line p-4 space-y-2">
        <div class="flex items-center justify-between">
          <span
            class="rounded px-2 py-0.5 text-[10px] font-extrabold uppercase font-mono border"
            :class="layerBadge(store.selectedNode.layer)"
          >
            {{ store.selectedNode.layer }}
          </span>
          <button
            type="button"
            class="text-xs text-muted hover:text-ink font-bold"
            @click="store.selectNode(null)"
          >
            ✕
          </button>
        </div>

        <h3 class="text-sm font-bold text-ink truncate font-mono" :title="store.selectedNode.name">
          {{ store.selectedNode.name }}
        </h3>
        <p class="text-[11px] text-muted truncate font-mono" :title="store.selectedNode.relPath">
          {{ store.selectedNode.relPath }}
        </p>

        <!-- Node Flags (Entry, Orphan) -->
        <div class="flex flex-wrap gap-1.5 pt-1">
          <span
            v-if="store.selectedNode.isEntry"
            class="rounded bg-running/15 text-running border border-running/30 px-1.5 py-0.5 text-[9px] font-bold uppercase font-mono"
          >
            🚀 Entry Point
          </span>
          <span
            v-if="store.selectedNode.isOrphan"
            class="rounded bg-warn/15 text-warn border border-warn/30 px-1.5 py-0.5 text-[9px] font-bold uppercase font-mono"
          >
            ⚠️ Orphan (Unreferenced)
          </span>
          <span class="rounded bg-elevated text-muted border border-line px-1.5 py-0.5 text-[9px] font-mono">
            {{ store.selectedNode.linesCount }} LOC
          </span>
          <span class="rounded bg-elevated text-muted border border-line px-1.5 py-0.5 text-[9px] font-mono">
            {{ (store.selectedNode.sizeBytes / 1024).toFixed(1) }} KB
          </span>
        </div>
      </div>

      <!-- Main Body Container -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <!-- Callers / Inbound Connections -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-mono font-bold text-ink">
            <span class="flex items-center gap-1.5">
              <span>📥</span> Imported By (Callers)
            </span>
            <span class="text-[10px] text-muted">({{ store.connectedInfo.incoming.length }})</span>
          </div>

          <div v-if="store.connectedInfo.incoming.length === 0" class="rounded-lg border border-dashed border-line p-3 text-center text-[11px] text-muted">
            Tidak ada file lain yang mengimpor komponen ini.
          </div>
          <div v-else class="space-y-1.5">
            <div
              v-for="caller in store.connectedInfo.incoming"
              :key="caller.id"
              class="group flex items-center justify-between rounded-lg border border-line bg-base p-2 transition hover:border-accent hover:bg-elevated cursor-pointer"
              @click="store.selectNode(caller.id)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="rounded px-1 py-0.2 text-[8px] font-bold uppercase font-mono border"
                  :class="layerBadge(caller.layer)"
                >
                  {{ caller.layer.slice(0, 3) }}
                </span>
                <span class="truncate text-xs font-mono font-medium text-ink group-hover:text-accent">
                  {{ caller.name }}
                </span>
              </div>
              <span class="text-[10px] text-muted font-mono">➔</span>
            </div>
          </div>
        </div>

        <!-- Dependencies / Outbound Connections -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-mono font-bold text-ink">
            <span class="flex items-center gap-1.5">
              <span>📤</span> Imports (Dependencies)
            </span>
            <span class="text-[10px] text-muted">({{ store.connectedInfo.outgoing.length }})</span>
          </div>

          <div v-if="store.connectedInfo.outgoing.length === 0" class="rounded-lg border border-dashed border-line p-3 text-center text-[11px] text-muted">
            Komponen ini tidak memiliki dependensi lokal internal.
          </div>
          <div v-else class="space-y-1.5">
            <div
              v-for="dep in store.connectedInfo.outgoing"
              :key="dep.id"
              class="group flex items-center justify-between rounded-lg border border-line bg-base p-2 transition hover:border-accent hover:bg-elevated cursor-pointer"
              @click="store.selectNode(dep.id)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="rounded px-1 py-0.2 text-[8px] font-bold uppercase font-mono border"
                  :class="layerBadge(dep.layer)"
                >
                  {{ dep.layer.slice(0, 3) }}
                </span>
                <span class="truncate text-xs font-mono font-medium text-ink group-hover:text-accent">
                  {{ dep.name }}
                </span>
              </div>
              <span class="text-[10px] text-muted font-mono">➔</span>
            </div>
          </div>
        </div>

        <!-- Code Snippet Preview -->
        <div class="space-y-2 border-t border-line pt-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono font-bold text-ink flex items-center gap-1.5">
              <span>📄</span> Source Code Preview
            </span>
            <button
              type="button"
              class="text-[11px] text-accent hover:underline font-mono"
              @click="showCodePreview = !showCodePreview; if (showCodePreview && !fileContent) fetchFileSnippet();"
            >
              {{ showCodePreview ? 'Hide' : 'Preview' }}
            </button>
          </div>

          <div v-if="showCodePreview" class="mt-2">
            <div v-if="fileLoading" class="p-4 text-center text-xs text-muted animate-pulse">
              Membaca file...
            </div>
            <pre
              v-else
              class="max-h-60 overflow-auto rounded-lg border border-line bg-base p-2.5 text-[10px] font-mono text-ink leading-relaxed"
            >{{ fileContent }}</pre>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
