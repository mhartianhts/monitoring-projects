<script setup lang="ts">
import { computed } from "vue";
import type { ITrace, SpanType } from "../../types/trace.types";
import { useTracesStore } from "../../stores/traces.store";

const props = defineProps<{
  trace: ITrace | null;
}>();

const store = useTracesStore();

const spanTheme = (type: SpanType) => {
  switch (type) {
    case "database":
      return { bg: "bg-emerald-600 hover:bg-emerald-500", text: "text-white", border: "border-emerald-700" };
    case "middleware":
      return { bg: "bg-amber-600 hover:bg-amber-500", text: "text-white", border: "border-amber-700" };
    case "compute":
      return { bg: "bg-purple-600 hover:bg-purple-500", text: "text-white", border: "border-purple-700" };
    case "cache":
      return { bg: "bg-blue-600 hover:bg-blue-500", text: "text-white", border: "border-blue-700" };
    case "external":
      return { bg: "bg-rose-600 hover:bg-rose-500", text: "text-white", border: "border-rose-700" };
    case "http":
    default:
      return { bg: "bg-cyan-600 hover:bg-cyan-500", text: "text-white", border: "border-cyan-700" };
  }
};

const totalDuration = computed(() => (props.trace ? Math.max(props.trace.durationMs, 1) : 100));

// Sort spans by duration descending for hotspot ranking
const hotspots = computed(() => {
  if (!props.trace) return [];
  return [...props.trace.spans]
    .filter((s) => s.type !== "http") // exclude root
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 3);
});
</script>

<template>
  <div class="flex h-full flex-col bg-base overflow-hidden p-4 space-y-4">
    <div v-if="!trace" class="flex h-full items-center justify-center text-xs text-muted">
      Pilih trace untuk melihat Flamegraph hierarchy.
    </div>

    <template v-else>
      <!-- Top Hotspots Banner -->
      <div class="rounded-xl border border-line bg-panel p-3.5 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-ink font-mono uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span>🔥</span> Top Performance Hotspots (Execution Bottlenecks)
          </span>
          <span class="text-[10px] text-muted font-mono">Ranked by CPU/IO time</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div
            v-for="(hotspot, idx) in hotspots"
            :key="hotspot.spanId"
            class="rounded-lg border border-line bg-base p-2.5 flex flex-col justify-between transition hover:border-accent"
            @click="store.selectSpan(hotspot.spanId)"
          >
            <div class="flex items-center justify-between text-[10px] font-mono mb-1">
              <span class="font-bold text-warn">#{{ idx + 1 }} Hotspot</span>
              <span class="font-bold text-ink">{{ ((hotspot.durationMs / totalDuration) * 100).toFixed(1) }}% of total</span>
            </div>
            <p class="truncate text-xs font-semibold text-ink font-mono" :title="hotspot.name">
              {{ hotspot.name }}
            </p>
            <div class="mt-2 flex items-center justify-between text-[10px] font-mono text-muted">
              <span class="uppercase font-bold">{{ hotspot.type }}</span>
              <span class="font-bold text-accent">{{ hotspot.durationMs }} ms</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Flamegraph Hierarchy Tree Stack -->
      <div class="flex-1 rounded-xl border border-line bg-panel p-4 overflow-y-auto space-y-3">
        <div class="flex items-center justify-between border-b border-line pb-2">
          <span class="text-xs font-bold text-ink font-mono">Execution Stack Depth (Top-to-Bottom)</span>
          <span class="text-[10px] text-muted font-mono">Click block to inspect details</span>
        </div>

        <!-- Level 0: Root HTTP Span -->
        <div class="space-y-1.5">
          <div class="text-[10px] font-mono text-muted uppercase tracking-wider">Level 0: Ingress Root</div>
          <div
            class="w-full rounded-md p-2.5 text-xs font-mono font-bold transition shadow-xs cursor-pointer flex items-center justify-between"
            :class="spanTheme('http').bg + ' ' + spanTheme('http').text"
            @click="store.selectSpan(trace.spans[0]?.spanId || null)"
          >
            <span class="truncate">{{ trace.name }}</span>
            <span class="shrink-0 text-[11px] font-bold">{{ trace.durationMs }}ms (100%)</span>
          </div>
        </div>

        <!-- Level 1: Child Execution Blocks (Stacked Horizontally) -->
        <div class="space-y-1.5 pt-2">
          <div class="text-[10px] font-mono text-muted uppercase tracking-wider">Level 1: Sub-Spans & Operations</div>
          
          <div class="flex w-full gap-1 overflow-hidden rounded-md border border-line bg-base p-1 min-h-[50px]">
            <div
              v-for="span in trace.spans.filter((s) => s.parentSpanId !== null || s.type !== 'http')"
              :key="span.spanId"
              class="group relative flex flex-col justify-between rounded p-2 text-xs font-mono transition cursor-pointer overflow-hidden border"
              :class="spanTheme(span.type).bg + ' ' + spanTheme(span.type).text + ' ' + spanTheme(span.type).border"
              :style="{ width: `${Math.max(12, (span.durationMs / totalDuration) * 100)}%` }"
              :title="`${span.name}: ${span.durationMs}ms`"
              @click="store.selectSpan(span.spanId)"
            >
              <div class="truncate text-[10px] font-bold">{{ span.type }}</div>
              <div class="truncate text-[11px] font-semibold opacity-90">{{ span.name }}</div>
              <div class="text-[10px] font-bold mt-1">
                {{ span.durationMs }}ms ({{ ((span.durationMs / totalDuration) * 100).toFixed(0) }}%)
              </div>
            </div>
          </div>
        </div>

        <!-- Flamegraph Table Breakdown -->
        <div class="pt-4">
          <div class="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">Detailed Call Tree</div>
          <div class="rounded-lg border border-line overflow-hidden">
            <table class="w-full text-left text-xs font-mono">
              <thead class="bg-elevated text-[10px] font-bold uppercase text-muted border-b border-line">
                <tr>
                  <th class="p-2.5">Operation Name</th>
                  <th class="p-2.5">Type</th>
                  <th class="p-2.5 text-right">Offset</th>
                  <th class="p-2.5 text-right">Duration</th>
                  <th class="p-2.5 text-right">% Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line/40 bg-panel">
                <tr
                  v-for="span in trace.spans"
                  :key="span.spanId"
                  class="transition hover:bg-elevated cursor-pointer"
                  :class="store.selectedSpanId === span.spanId ? 'bg-accent/15 text-accent font-bold' : 'text-ink'"
                  @click="store.selectSpan(span.spanId)"
                >
                  <td class="p-2.5 flex items-center gap-2 truncate max-w-xs">
                    <span v-if="span.parentSpanId" class="text-muted text-[10px]">↳</span>
                    <span class="truncate">{{ span.name }}</span>
                  </td>
                  <td class="p-2.5 text-muted uppercase text-[10px]">{{ span.type }}</td>
                  <td class="p-2.5 text-right text-muted">+{{ span.offsetMs }}ms</td>
                  <td class="p-2.5 text-right font-bold">{{ span.durationMs }} ms</td>
                  <td class="p-2.5 text-right text-accent font-bold">
                    {{ ((span.durationMs / totalDuration) * 100).toFixed(1) }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
