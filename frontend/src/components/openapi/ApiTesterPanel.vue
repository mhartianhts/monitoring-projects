<script setup lang="ts">
import { ref, computed } from "vue";
import { useOpenApiStore } from "../../stores/openapi.store";
import { useProjectStore } from "../../stores/project.store";
import type { HttpMethod } from "../../types/openapi.types";

const store = useOpenApiStore();
const projectStore = useProjectStore();
const activeRequestTab = ref<"body" | "params" | "headers">("body");
const copySuccess = ref(false);

const methodColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500 text-white",
  POST: "bg-cyan-500 text-white",
  PUT: "bg-amber-500 text-white",
  PATCH: "bg-amber-600 text-white",
  DELETE: "bg-rose-500 text-white",
  OPTIONS: "bg-purple-500 text-white",
  HEAD: "bg-gray-500 text-white",
};

const statusClasses = (code: number) => {
  if (code >= 500) return "bg-stopped/20 text-stopped border-stopped/30";
  if (code >= 400) return "bg-warn/20 text-warn border-warn/30";
  if (code >= 300) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-running/20 text-running border-running/30";
};

const fullTargetUrl = computed(() => {
  const base = store.specData?.serverUrl || "http://localhost:3000";
  const path = store.reqPath.startsWith("/") ? store.reqPath : "/" + store.reqPath;
  return `${base}${path}`;
});

const generateCurl = () => {
  const method = store.reqMethod;
  const url = fullTargetUrl.value;
  let cmd = `curl -X ${method} "${url}"`;

  try {
    const headers = JSON.parse(store.reqHeaders);
    for (const [k, v] of Object.entries(headers)) {
      cmd += ` \\\n  -H "${k}: ${v}"`;
    }
  } catch {}

  if (["POST", "PUT", "PATCH"].includes(method) && store.reqBody.trim()) {
    try {
      const minBody = JSON.stringify(JSON.parse(store.reqBody));
      cmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${minBody}'`;
    } catch {
      cmd += ` \\\n  -d '${store.reqBody}'`;
    }
  }

  return cmd;
};

const copyCurl = async () => {
  const curlCmd = generateCurl();
  await navigator.clipboard.writeText(curlCmd);
  copySuccess.value = true;
  setTimeout(() => {
    copySuccess.value = false;
  }, 2000);
};

const prettyResponseJson = computed(() => {
  if (!store.lastResponse) return "";
  const data = store.lastResponse.data;
  return typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
});
</script>

<template>
  <div class="flex h-full flex-1 flex-col bg-base overflow-hidden">
    <div v-if="!store.selectedEndpoint" class="flex h-full items-center justify-center p-8 text-center text-xs text-muted">
      Pilih salah satu endpoint di daftar sebelah kiri untuk menguji request dan melihat responsnya.
    </div>

    <template v-else>
      <!-- Top Request Bar -->
      <div class="border-b border-line bg-panel p-4 space-y-3 shrink-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-ink font-mono flex items-center gap-2">
            <span>🚀</span> {{ store.selectedEndpoint.summary }}
          </span>
          <span class="rounded bg-elevated px-2 py-0.5 text-[10px] text-muted font-mono border border-line">
            Source: {{ store.selectedEndpoint.sourceFile }}
          </span>
        </div>

        <!-- URL Input & Send Action Group -->
        <div class="flex items-center gap-2">
          <!-- Method Selector -->
          <select
            v-model="store.reqMethod"
            class="rounded-lg border border-line px-3 py-2 text-xs font-bold font-mono outline-none shadow-xs"
            :class="methodColors[store.reqMethod] || 'bg-elevated text-ink'"
          >
            <option v-for="m in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']" :key="m" :value="m" class="bg-panel text-ink">
              {{ m }}
            </option>
          </select>

          <!-- Path Input -->
          <div class="relative flex-1">
            <input
              v-model="store.reqPath"
              type="text"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 text-xs text-ink font-mono outline-none focus:border-accent shadow-xs"
              placeholder="/api/v1/resource"
            />
          </div>

          <!-- Send Request Button -->
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-accent-dim active:scale-95 disabled:opacity-50"
            :disabled="store.sending || !projectStore.selectedId"
            @click="store.executeRequest(projectStore.selectedId!)"
          >
            <span v-if="store.sending" class="animate-spin">⏳</span>
            <span v-else>⚡</span>
            <span>{{ store.sending ? 'Sending...' : 'Send Request' }}</span>
          </button>
        </div>
      </div>

      <!-- Split Request Config & Response Area -->
      <div class="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-line">
        <!-- Left Pane: Request Builder (Tabs: Body, Params, Headers) -->
        <div class="flex flex-1 flex-col overflow-hidden bg-panel/40">
          <!-- Request Tabs -->
          <div class="flex items-center justify-between border-b border-line bg-panel px-3 py-1.5 shrink-0">
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-bold transition font-mono"
                :class="activeRequestTab === 'body' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-ink'"
                @click="activeRequestTab = 'body'"
              >
                Body (JSON)
              </button>
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-bold transition font-mono"
                :class="activeRequestTab === 'params' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-ink'"
                @click="activeRequestTab = 'params'"
              >
                Query Params
              </button>
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-bold transition font-mono"
                :class="activeRequestTab === 'headers' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-ink'"
                @click="activeRequestTab = 'headers'"
              >
                Headers
              </button>
            </div>

            <!-- Copy cURL button -->
            <button
              type="button"
              class="flex items-center gap-1 rounded bg-elevated px-2 py-0.5 text-[10px] font-mono text-muted hover:text-accent transition border border-line"
              @click="copyCurl"
            >
              <span>📋</span>
              <span>{{ copySuccess ? 'Copied cURL!' : 'Copy cURL' }}</span>
            </button>
          </div>

          <!-- Tab Content Form Editors -->
          <div class="flex-1 p-3 overflow-hidden">
            <!-- Body Editor -->
            <div v-if="activeRequestTab === 'body'" class="h-full flex flex-col space-y-1.5">
              <span class="text-[10px] font-bold uppercase text-muted font-mono">Raw JSON Payload:</span>
              <textarea
                v-model="store.reqBody"
                class="h-full w-full flex-1 rounded-lg border border-line bg-base p-3 text-xs text-ink font-mono outline-none focus:border-accent resize-none leading-relaxed"
                placeholder='{\n  "key": "value"\n}'
              ></textarea>
            </div>

            <!-- Query Params Editor -->
            <div v-else-if="activeRequestTab === 'params'" class="h-full flex flex-col space-y-1.5">
              <span class="text-[10px] font-bold uppercase text-muted font-mono">Query Parameters (JSON Object):</span>
              <textarea
                v-model="store.reqQueryParams"
                class="h-full w-full flex-1 rounded-lg border border-line bg-base p-3 text-xs text-ink font-mono outline-none focus:border-accent resize-none leading-relaxed"
                placeholder='{\n  "page": "1",\n  "limit": "20"\n}'
              ></textarea>
            </div>

            <!-- Headers Editor -->
            <div v-else-if="activeRequestTab === 'headers'" class="h-full flex flex-col space-y-1.5">
              <span class="text-[10px] font-bold uppercase text-muted font-mono">Request Headers (JSON Object):</span>
              <textarea
                v-model="store.reqHeaders"
                class="h-full w-full flex-1 rounded-lg border border-line bg-base p-3 text-xs text-ink font-mono outline-none focus:border-accent resize-none leading-relaxed"
                placeholder='{\n  "Authorization": "Bearer token"\n}'
              ></textarea>
            </div>
          </div>
        </div>

        <!-- Right Pane: Response Viewer -->
        <div class="flex flex-1 flex-col overflow-hidden bg-base">
          <!-- Response Header Status Bar -->
          <div class="flex items-center justify-between border-b border-line bg-panel px-4 py-2 shrink-0">
            <span class="text-xs font-bold text-ink font-mono uppercase tracking-wider text-[11px]">
              Response Output
            </span>

            <div v-if="store.lastResponse" class="flex items-center gap-2 font-mono text-xs">
              <!-- Status Badge -->
              <span
                class="rounded px-2 py-0.5 text-[10px] font-bold uppercase border"
                :class="statusClasses(store.lastResponse.statusCode)"
              >
                {{ store.lastResponse.statusCode }} {{ store.lastResponse.statusText }}
              </span>

              <!-- Latency -->
              <span class="rounded bg-elevated px-2 py-0.5 text-[10px] text-accent border border-line font-bold">
                ⏱️ {{ store.lastResponse.durationMs }} ms
              </span>

              <!-- Size -->
              <span class="rounded bg-elevated px-2 py-0.5 text-[10px] text-muted border border-line">
                💾 {{ (store.lastResponse.sizeBytes / 1024).toFixed(1) }} KB
              </span>
            </div>
          </div>

          <!-- Response Body Box -->
          <div class="flex-1 p-3 overflow-hidden">
            <!-- Loading Indicator -->
            <div v-if="store.sending" class="flex h-full items-center justify-center text-xs text-muted animate-pulse">
              Mengirim request ke {{ fullTargetUrl }}...
            </div>

            <!-- Error Banner -->
            <div
              v-else-if="store.executionError"
              class="rounded-lg border border-stopped/40 bg-stopped/15 p-4 text-xs font-mono text-stopped space-y-1.5"
            >
              <div class="font-bold flex items-center gap-1.5">
                <span>🚨</span> Request Execution Failed
              </div>
              <p class="leading-relaxed">{{ store.executionError }}</p>
            </div>

            <!-- Empty State -->
            <div
              v-else-if="!store.lastResponse"
              class="flex h-full flex-col items-center justify-center text-xs text-muted text-center p-8"
            >
              <span class="text-3xl mb-2">⚡</span>
              <p class="font-medium text-ink">Belum ada response</p>
              <p class="text-[11px] max-w-xs mt-1">
                Klik tombol <b>Send Request</b> di atas untuk menjalankan request secara langsung ke port server lokal.
              </p>
            </div>

            <!-- Formatted Response Code -->
            <pre
              v-else
              class="h-full w-full overflow-auto rounded-lg border border-line bg-panel p-3 text-xs font-mono text-ink leading-relaxed"
            >{{ prettyResponseJson }}</pre>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
