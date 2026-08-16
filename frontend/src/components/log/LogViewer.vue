<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { LogEntry } from '../../types/project';
import IconButton from '../ui/IconButton.vue';
import { notify } from '../../services/notification.service';

interface Props {
  logs: LogEntry[];
}

const props = defineProps<Props>();
const emit = defineEmits<{ clear: [] }>();

const containerRef = ref<HTMLElement | null>(null);
const autoScroll = ref(true);
const searchQuery = ref('');
const streamFilter = ref<'all' | 'stderr' | 'stdout' | 'system'>('all');

const filteredLogs = computed(() => {
  return props.logs.filter((entry) => {
    if (streamFilter.value !== 'all' && entry.stream !== streamFilter.value) {
      return false;
    }
    if (searchQuery.value.trim() !== '') {
      return entry.line.toLowerCase().includes(searchQuery.value.toLowerCase());
    }
    return true;
  });
});

const errorCount = computed(() => props.logs.filter((l) => l.stream === 'stderr').length);

const onScroll = () => {
  const el = containerRef.value;
  if (!el) return;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  autoScroll.value = distance < 40;
};

const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value;
  if (autoScroll.value && containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight;
  }
};

const copyLogs = async () => {
  if (props.logs.length === 0) return;
  const text = filteredLogs.value.map((l) => l.line).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    notify.toast('Log tersalin ke clipboard', 'success');
  } catch {
    notify.toast('Gagal menyalin log', 'error');
  }
};

watch(
  () => props.logs.length,
  async () => {
    await nextTick();
    const el = containerRef.value;
    if (!el || !autoScroll.value) return;
    el.scrollTop = el.scrollHeight;
  },
);

const lineClass = (stream: LogEntry['stream']) => {
  if (stream === 'stderr') return 'text-stopped bg-stopped/10 px-1 rounded';
  if (stream === 'system') return 'text-accent font-semibold';
  return 'text-ink/90';
};
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-log">
    <!-- Log Viewer Toolbar Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2 bg-panel/60">
      <div class="flex items-center gap-3">
        <span class="text-xs font-semibold text-ink flex items-center gap-1.5">
          <span>📜</span> Log Output
          <span class="font-mono text-[10px] text-muted">({{ filteredLogs.length }})</span>
        </span>

        <!-- Stream Filter Chips -->
        <div class="flex items-center gap-1 text-[11px]">
          <button
            type="button"
            class="rounded px-2 py-0.5 font-medium transition"
            :class="streamFilter === 'all' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-ink'"
            @click="streamFilter = 'all'"
          >
            All
          </button>
          <button
            type="button"
            class="rounded px-2 py-0.5 font-medium transition"
            :class="streamFilter === 'stderr' ? 'bg-stopped/20 text-stopped font-semibold' : 'text-muted hover:text-ink'"
            @click="streamFilter = 'stderr'"
          >
            Errors ({{ errorCount }})
          </button>
          <button
            type="button"
            class="rounded px-2 py-0.5 font-medium transition"
            :class="streamFilter === 'system' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-ink'"
            @click="streamFilter = 'system'"
          >
            System
          </button>
        </div>
      </div>

      <!-- Live Search & Control Buttons -->
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Filter log..."
          class="w-36 md:w-48 rounded border border-line bg-base px-2.5 py-1 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
        />

        <button
          type="button"
          class="rounded px-2 py-1 text-[11px] font-mono transition flex items-center gap-1 border border-line"
          :class="autoScroll ? 'bg-running/15 text-running border-running/30' : 'bg-elevated text-warn'"
          @click="toggleAutoScroll"
        >
          <span>{{ autoScroll ? '● Auto-scroll ON' : '⏸ Auto-scroll PAUSED' }}</span>
        </button>

        <IconButton label="Copy" variant="ghost" :disabled="logs.length === 0" @click="copyLogs" />
        <IconButton label="Clear Log" variant="ghost" :disabled="logs.length === 0" @click="emit('clear')" />
      </div>
    </div>

    <!-- Scrollable Log Content -->
    <div
      ref="containerRef"
      class="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-5 space-y-0.5"
      @scroll="onScroll"
    >
      <p v-if="logs.length === 0" class="text-muted text-center py-6">
        Belum ada output log. Klik <span class="text-accent font-semibold">Start</span> untuk menjalankan server.
      </p>
      <p v-else-if="filteredLogs.length === 0" class="text-muted text-center py-6">
        Tidak ada baris log yang cocok dengan filter "{{ searchQuery }}".
      </p>
      <div
        v-for="(entry, index) in filteredLogs"
        :key="`${entry.ts}-${index}`"
        class="whitespace-pre-wrap break-all hover:bg-elevated/40 transition-colors rounded px-1"
        :class="lineClass(entry.stream)"
      >
        {{ entry.line }}
      </div>
    </div>
  </section>
</template>
