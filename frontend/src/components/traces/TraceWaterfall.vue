<script setup lang="ts">
import { computed } from "vue";
import type { ISpan, ITrace, SpanType } from "../../types/trace.types";
import { useTracesStore } from "../../stores/traces.store";

const props = defineProps<{
  trace: ITrace | null;
}>();

const store = useTracesStore();

const spanColor = (type: SpanType) => {
  switch (type) {
    case "database":
      return {
        bg: "bg-emerald-500",
        border: "border-emerald-600",
        badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        label: "Database",
      };
    case "middleware":
      return {
        bg: "bg-amber-500",
        border: "border-amber-600",
        badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        label: "Middleware",
      };
    case "compute":
      return {
        bg: "bg-purple-500",
        border: "border-purple-600",
        badge: "bg-purple-500/15 text-purple-400 border-purple-500/30",
        label: "Compute",
      };
    case "cache":
      return {
        bg: "bg-blue-500",
        border: "border-blue-600",
        badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        label: "Cache",
      };
    case "external":
      return {
        bg: "bg-rose-500",
        border: "border-rose-600",
        badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
        label: "External",
      };
    case "http":
    default:
      return {
        bg: "bg-cyan-500",
        border: "border-cyan-600",
        badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
        label: "HTTP Root",
      };
  }
};

const totalDuration = computed(() => {
  if (!props.trace) return 100;
  return Math.max(props.trace.durationMs, 1);
});

// Calculate bar left offset and width percentage
const getSpanBarStyle = (span: ISpan) => {
  const total = totalDuration.value;
  const leftPct = Math.min(95, Math.max(0, (span.offsetMs / total) * 100));
  const widthPct = Math.min(100 - leftPct, Math.max(3, (span.durationMs / total) * 100));

  return {
    left: `${leftPct}%`,
    width: `${widthPct}%`,
  };
};

const formatMetadata = (data?: Record<string, any>) => {
  if (!data || Object.keys(data).length === 0) return null;
  return JSON.stringify(data, null, 2);
};
</script>

<template>
  <div class="flex h-full flex-col bg-base overflow-hidden">
    <div v-if="!trace" class="flex h-full items-center justify-center p-12 text-center text-xs text-muted">
      Pilih salah satu trace dari daftar di sebelah kiri untuk melihat visualisasi waterfall.
    </div>

    <template v-else>
      <!-- Trace Header Banner -->
      <div class="border-b border-line bg-panel p-4 flex flex-wrap items-center justify-between gap-4">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2">
            <span
              class="rounded px-2 py-0.5 text-xs font-extrabold font-mono uppercase"
              :class="trace.statusCode >= 400 ? 'bg-stopped/20 text-stopped' : 'bg-running/20 text-running'"
            >
              {{ trace.method }} {{ trace.statusCode }}
            </span>
            <h2 class="text-sm font-bold text-ink truncate font-mono">{{ trace.path }}</h2>
          </div>
          <div class="flex items-center gap-3 text-[11px] text-muted font-mono">
            <span>Trace ID: <b class="text-ink">{{ trace.traceId }}</b></span>
            <span>•</span>
            <span>Total Latency: <b :class="trace.durationMs > 500 ? 'text-stopped' : 'text-accent'">{{ trace.durationMs }} ms</b></span>
            <span>•</span>
            <span>Spans: <b class="text-ink">{{ trace.spans.length }}</b></span>
          </div>
        </div>

        <!-- Legend -->
        <div class="flex flex-wrap items-center gap-2 text-[10px] font-mono">
          <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-cyan-500"></span> HTTP</span>
          <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-emerald-500"></span> DB</span>
          <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-amber-500"></span> Middleware</span>
          <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-purple-500"></span> Compute</span>
          <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-blue-500"></span> Cache</span>
          <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-rose-500"></span> External</span>
        </div>
      </div>

      <!-- Main Timeline View Area -->
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <!-- Timeline Ruler / Axis -->
        <div class="relative mb-2 flex items-center justify-between border-b border-line pb-1 text-[10px] font-mono text-muted">
          <span>0 ms</span>
          <span>{{ (totalDuration * 0.25).toFixed(1) }} ms</span>
          <span>{{ (totalDuration * 0.5).toFixed(1) }} ms</span>
          <span>{{ (totalDuration * 0.75).toFixed(1) }} ms</span>
          <span>{{ totalDuration.toFixed(1) }} ms</span>
        </div>

        <!-- Spans Waterfall Rows -->
        <div class="space-y-2">
          <div
            v-for="(span, idx) in trace.spans"
            :key="span.spanId || idx"
            class="group rounded-lg border border-line bg-panel p-2.5 transition hover:border-accent/50 hover:bg-elevated cursor-pointer"
            :class="store.selectedSpanId === span.spanId ? 'ring-1 ring-accent bg-accent/5' : ''"
            @click="store.selectSpan(span.spanId)"
          >
            <!-- Span Row Header: Name, Type Badge, Duration -->
            <div class="flex items-center justify-between gap-3 text-xs mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="rounded px-1.5 py-0.5 text-[9px] font-bold font-mono uppercase border"
                  :class="spanColor(span.type).badge"
                >
                  {{ spanColor(span.type).label }}
                </span>
                <span class="truncate font-mono text-xs font-semibold text-ink group-hover:text-accent transition-colors">
                  {{ span.name }}
                </span>
                <span v-if="span.status === 'error'" class="text-[10px] font-bold text-stopped bg-stopped/20 px-1.5 py-0.5 rounded">
                  ERROR
                </span>
              </div>
              <div class="flex items-center gap-3 shrink-0 font-mono text-xs">
                <span class="text-muted text-[10px]">+{{ span.offsetMs }}ms</span>
                <span class="font-bold text-ink">{{ span.durationMs }} ms</span>
              </div>
            </div>

            <!-- Gantt Bar Track -->
            <div class="relative h-2.5 w-full rounded bg-base/80 overflow-hidden border border-line/60">
              <!-- Grid lines -->
              <div class="absolute inset-0 grid grid-cols-4 pointer-events-none opacity-20 divide-x divide-line">
                <div></div><div></div><div></div><div></div>
              </div>

              <!-- Span Duration Bar -->
              <div
                class="absolute top-0 bottom-0 rounded shadow-xs transition-all duration-300"
                :class="span.status === 'error' ? 'bg-stopped' : spanColor(span.type).bg"
                :style="getSpanBarStyle(span)"
                :title="`${span.name}: ${span.durationMs}ms (+${span.offsetMs}ms)`"
              ></div>
            </div>

            <!-- Expandable Inspector details if this span is selected -->
            <div
              v-if="store.selectedSpanId === span.spanId"
              class="mt-3 rounded-md border border-line bg-base p-3 text-xs space-y-2 font-mono transition-all"
            >
              <div class="flex items-center justify-between border-b border-line pb-1.5">
                <span class="font-bold text-accent text-[11px]">🔍 Span Details & Context</span>
                <span class="text-[10px] text-muted">{{ span.spanId }}</span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div><span class="text-muted">Layer:</span> <b class="text-ink">{{ span.type }}</b></div>
                <div><span class="text-muted">Duration:</span> <b class="text-ink">{{ span.durationMs }}ms</b></div>
                <div><span class="text-muted">Start Offset:</span> <b class="text-ink">+{{ span.offsetMs }}ms</b></div>
                <div><span class="text-muted">Status:</span> <b :class="span.status === 'error' ? 'text-stopped' : 'text-running'">{{ span.status }}</b></div>
              </div>

              <!-- Error Message if present -->
              <div v-if="span.error" class="rounded bg-stopped/15 border border-stopped/30 p-2 text-stopped text-[11px]">
                <b>Error:</b> {{ span.error }}
              </div>

              <!-- Metadata JSON (e.g. SQL Query, Endpoint, Headers) -->
              <div v-if="formatMetadata(span.metadata)">
                <span class="text-[10px] font-bold text-muted uppercase">Metadata / Payload:</span>
                <pre class="mt-1 max-h-36 overflow-auto rounded bg-elevated p-2 text-[10px] text-ink font-mono border border-line whitespace-pre-wrap">{{ formatMetadata(span.metadata) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
