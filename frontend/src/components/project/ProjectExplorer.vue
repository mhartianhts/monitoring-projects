<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { FileNode } from "../../types/project";
import { api } from "../../services/api";

const props = defineProps<{
  projectId: string | null;
  attachedFiles: string[];
}>();

const emit = defineEmits<{
  (e: "select-file", path: string): void;
  (e: "toggle-attach", path: string): void;
}>();

const rootName = ref("");
const treeData = ref<FileNode[]>([]);
const loading = ref(false);
const error = ref("");
const expandedPaths = ref<Set<string>>(new Set());
const filterQuery = ref("");

const fetchTree = async () => {
  if (!props.projectId) {
    treeData.value = [];
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const res = await api.getProjectTree(props.projectId);
    rootName.value = res.rootName;
    treeData.value = res.tree;
    // Auto expand top level directories
    const topDirs = res.tree.filter((n) => n.type === "directory").map((n) => n.path);
    expandedPaths.value = new Set(topDirs.slice(0, 3));
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Gagal memuat file tree";
  } finally {
    loading.value = false;
  }
};

watch(() => props.projectId, fetchTree, { immediate: true });

const toggleExpand = (dirPath: string) => {
  const next = new Set(expandedPaths.value);
  if (next.has(dirPath)) {
    next.delete(dirPath);
  } else {
    next.add(dirPath);
  }
  expandedPaths.value = next;
};

const isAttached = (path: string) => props.attachedFiles.includes(path);

const filterTree = (nodes: FileNode[], query: string): FileNode[] => {
  if (!query.trim()) return nodes;
  const q = query.toLowerCase();

  const filtered: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
        filtered.push(node);
      }
    } else if (node.type === "directory" && node.children) {
      const matchingChildren = filterTree(node.children, q);
      if (matchingChildren.length > 0 || node.name.toLowerCase().includes(q)) {
        filtered.push({
          ...node,
          children: matchingChildren,
        });
      }
    }
  }
  return filtered;
};

const displayTree = computed(() => filterTree(treeData.value, filterQuery.value));
</script>

<template>
  <div class="flex h-full w-72 shrink-0 flex-col border-r border-line bg-panel text-sm">
    <div class="flex items-center justify-between border-b border-line px-4 py-3">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Project Explorer</span>
      </div>
      <button
        type="button"
        class="text-xs text-accent hover:underline"
        title="Refresh File Tree"
        @click="fetchTree"
      >
        Refresh
      </button>
    </div>

    <div class="px-3 py-2 border-b border-line">
      <input
        v-model="filterQuery"
        type="search"
        placeholder="Filter file project..."
        class="w-full rounded border border-line bg-base px-2.5 py-1 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
      />
    </div>

    <div class="flex-1 overflow-y-auto p-2">
      <p v-if="loading" class="px-2 py-3 text-xs text-muted">Memuat struktur file...</p>
      <p v-else-if="error" class="px-2 py-3 text-xs text-stopped">{{ error }}</p>
      <p v-else-if="displayTree.length === 0" class="px-2 py-3 text-xs text-muted">
        Tidak ada file ditemukan
      </p>

      <div v-else class="space-y-0.5">
        <template v-for="node in displayTree" :key="node.path">
          <!-- Directory Node -->
          <div v-if="node.type === 'directory'" class="space-y-0.5">
            <button
              type="button"
              class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-elevated/70 text-ink text-xs font-medium"
              @click="toggleExpand(node.path)"
            >
              <span class="text-muted font-mono text-[10px]">
                {{ expandedPaths.has(node.path) ? "▼" : "►" }}
              </span>
              <span class="text-accent">📁</span>
              <span class="truncate">{{ node.name }}</span>
            </button>

            <!-- Subtree -->
            <div
              v-if="expandedPaths.has(node.path) || filterQuery.trim()"
              class="ml-3 border-l border-line/60 pl-1 space-y-0.5"
            >
              <template v-for="child in node.children" :key="child.path">
                <div v-if="child.type === 'directory'" class="space-y-0.5">
                  <button
                    type="button"
                    class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-elevated/70 text-ink text-xs"
                    @click="toggleExpand(child.path)"
                  >
                    <span class="text-muted font-mono text-[10px]">
                      {{ expandedPaths.has(child.path) ? "▼" : "►" }}
                    </span>
                    <span class="text-accent">📁</span>
                    <span class="truncate">{{ child.name }}</span>
                  </button>
                  <div
                    v-if="expandedPaths.has(child.path) || filterQuery.trim()"
                    class="ml-3 border-l border-line/60 pl-1 space-y-0.5"
                  >
                    <div
                      v-for="subFile in child.children"
                      :key="subFile.path"
                      class="flex items-center justify-between rounded px-2 py-1 hover:bg-elevated/80 group"
                      :class="isAttached(subFile.path) ? 'bg-accent/10 font-medium' : ''"
                    >
                      <button
                        type="button"
                        class="flex min-w-0 items-center gap-1.5 text-left text-xs text-muted group-hover:text-ink"
                        @click="emit('select-file', subFile.path)"
                      >
                        <span class="text-muted/70">📄</span>
                        <span class="truncate">{{ subFile.name }}</span>
                      </button>
                      <button
                        type="button"
                        class="text-[10px] px-1 rounded transition"
                        :class="
                          isAttached(subFile.path)
                            ? 'bg-accent text-base font-semibold'
                            : 'text-muted hover:text-accent group-hover:inline'
                        "
                        :title="isAttached(subFile.path) ? 'Hapus konteks' : 'Tambah ke konteks AI'"
                        @click.stop="emit('toggle-attach', subFile.path)"
                      >
                        {{ isAttached(subFile.path) ? "✓ Context" : "+ Attach" }}
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="flex items-center justify-between rounded px-2 py-1 hover:bg-elevated/80 group"
                  :class="isAttached(child.path) ? 'bg-accent/10 font-medium' : ''"
                >
                  <button
                    type="button"
                    class="flex min-w-0 items-center gap-1.5 text-left text-xs text-muted group-hover:text-ink"
                    @click="emit('select-file', child.path)"
                  >
                    <span class="text-muted/70">📄</span>
                    <span class="truncate">{{ child.name }}</span>
                  </button>
                  <button
                    type="button"
                    class="text-[10px] px-1 rounded transition"
                    :class="
                      isAttached(child.path)
                        ? 'bg-accent text-base font-semibold'
                        : 'text-muted hover:text-accent group-hover:inline'
                    "
                    :title="isAttached(child.path) ? 'Hapus konteks' : 'Tambah ke konteks AI'"
                    @click.stop="emit('toggle-attach', child.path)"
                  >
                    {{ isAttached(child.path) ? "✓ Context" : "+ Attach" }}
                  </button>
                </div>
              </template>
            </div>
          </div>

          <!-- Root File Node -->
          <div
            v-else
            class="flex items-center justify-between rounded px-2 py-1 hover:bg-elevated/80 group"
            :class="isAttached(node.path) ? 'bg-accent/10 font-medium' : ''"
          >
            <button
              type="button"
              class="flex min-w-0 items-center gap-1.5 text-left text-xs text-muted group-hover:text-ink"
              @click="emit('select-file', node.path)"
            >
              <span class="text-muted/70">📄</span>
              <span class="truncate">{{ node.name }}</span>
            </button>
            <button
              type="button"
              class="text-[10px] px-1 rounded transition"
              :class="
                isAttached(node.path)
                  ? 'bg-accent text-base font-semibold'
                  : 'text-muted hover:text-accent group-hover:inline'
              "
              :title="isAttached(node.path) ? 'Hapus konteks' : 'Tambah ke konteks AI'"
              @click.stop="emit('toggle-attach', node.path)"
            >
              {{ isAttached(node.path) ? "✓ Context" : "+ Attach" }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
