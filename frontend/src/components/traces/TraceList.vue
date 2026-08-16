<script setup lang="ts">
import { useTracesStore } from "../../stores/traces.store";

const store = useTracesStore();

const methodClasses = (method: string) => {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "POST":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "PUT":
    case "PATCH":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "DELETE":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    default:
      return "bg-gray-500/15 text-gray-400 border-gray-500/30";
  }
};

const statusClasses = (code: number) => {
  if (code >= 500) return "bg-stopped/20 text-stopped border-stopped/30";
  if (code >= 400) return "bg-warn/20 text-warn border-warn/30";
  if (code >= 300) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-running/20 text-running border-running/30";
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toTimeString().split(" ")[0] + "." + String(d.getMilliseconds()).padStart(3, "0");
};
</script>

<template>
  <div class="flex h-full flex-col border-r border-line bg-panel">
    <!-- Filter Bar Header -->
    <div class="p-3 border-b border-line space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <input
          v-model="store.search"
          type="search"
          placeholder="Filter route / SQL / trace ID..."
          class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs text-ink placeholder:text-muted outline-none focus:border-accent"
        />
      </div>

      <!-- Quick Filter Buttons -->
      <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
        <!-- Status Filter -->
        <button
          type="button"
          class="rounded px-2 py-0.5 font-medium transition"
          :class="store.statusFilter === 'all' ? 'bg-accent/20 text-accent font-bold' : 'text-muted hover:text-ink'"
          @click="store.statusFilter = 'all'"
        >
          All ({{ store.traces.length }})
        </button>
        <button
          type="button"
          class="rounded px-2 py-0.5 font-medium transition"
          :class="store.statusFilter === 'slow' ? 'bg-warn/20 text-warn font-bold' : 'text-muted hover:text-ink'"
          @click="store.statusFilter = 'slow'"
        >
          🐢 Slow (>400ms)
        </button>
        <button
          type="button"
          class="rounded px-2 py-0.5 font-medium transition"
          :class="store.statusFilter === 'error' ? 'bg-stopped/20 text-stopped font-bold' : 'text-muted hover:text-ink'"
          @click="store.statusFilter = 'error'"
        >
          🚨 Errors
        </button>
      </div>

      <!-- Method Filters -->
      <div class="flex items-center gap-1 text-[10px] font-mono">
        <button
          v-for="m in ['all', 'GET', 'POST', 'PUT', 'DELETE']"
          :key="m"
          type="button"
          class="rounded px-1.5 py-0.5 transition uppercase"
          :class="store.methodFilter === m ? 'bg-elevated border border-accent/40 text-accent font-bold' : 'text-muted hover:text-ink'"
          @click="store.methodFilter = m"
        >
          {{ m }}
        </button>
      </div>
    </div>

    <!-- Trace List Container -->
    <div class="flex-1 overflow-y-auto divide-y divide-line/40">
      <div v-if="store.loading" class="p-8 text-center text-xs text-muted animate-pulse">
        Memuat data traces...
      </div>

      <div
        v-else-if="store.filteredTraces.length === 0"
        class="p-8 text-center text-xs text-muted flex flex-col items-center justify-center gap-2"
      >
        <span class="text-2xl">📡</span>
        <p class="font-medium text-ink">Belum ada request trace</p>
        <p class="text-[11px] max-w-xs">
          Kirim request ke API backend Anda atau klik tombol <b>Generate Demo Traffic</b> di atas untuk melihat visualisasi.
        </p>
      </div>

      <template v-else>
        <div
          v-for="trace in store.filteredTraces"
          :key="trace.traceId"
          class="group relative flex cursor-pointer flex-col p-3 transition hover:bg-elevated"
          :class="store.selectedTraceId === trace.traceId ? 'bg-accent/10 border-l-2 border-accent' : ''"
          @click="store.selectTrace(trace.traceId)"
        >
          <!-- Top Row: Method, Status Code, Path -->
          <div class="flex items-center justify-between gap-2 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <!-- Method Pill -->
              <span
                class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold font-mono border"
                :class="methodClasses(trace.method)"
              >
                {{ trace.method }}
              </span>

              <!-- Status Code Badge -->
              <span
                class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold font-mono border"
                :class="statusClasses(trace.statusCode)"
              >
                {{ trace.statusCode }}
              </span>

              <!-- Path -->
              <span class="truncate font-mono text-xs font-semibold text-ink group-hover:text-accent transition-colors">
                {{ trace.path }}
              </span>
            </div>

            <!-- Latency / Duration -->
            <div class="shrink-0 text-right font-mono text-xs font-bold" :class="trace.durationMs > 500 ? 'text-stopped' : trace.durationMs > 200 ? 'text-warn' : 'text-ink'">
              {{ trace.durationMs }}ms
            </div>
          </div>

          <!-- Bottom Row: Service Name, Spans Count, Time -->
          <div class="mt-2 flex items-center justify-between text-[10px] text-muted font-mono">
            <div class="flex items-center gap-2 truncate">
              <span class="rounded bg-elevated px-1 py-0.5 text-[9px] text-muted border border-line">
                {{ trace.service || trace.projectId }}
              </span>
              <span>{{ trace.spansCount }} spans</span>
            </div>
            <span>{{ formatTime(trace.startTime) }}</span>
          </div>

          <!-- Mini Latency Bar Indicator -->
          <div class="mt-1.5 h-1 w-full overflow-hidden rounded bg-base">
            <div
              class="h-full rounded transition-all"
              :class="
                trace.status === 'error'
                  ? 'bg-stopped'
                  : trace.durationMs > 500
                  ? 'bg-warn'
                  : 'bg-accent'
              "
              :style="{ width: `${Math.min(100, Math.max(8, (trace.durationMs / 800) * 100))}%` }"
            ></div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
