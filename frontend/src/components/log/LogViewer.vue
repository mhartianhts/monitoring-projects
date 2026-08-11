<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { LogEntry } from '../../types/project';
import IconButton from '../ui/IconButton.vue';

interface Props {
  logs: LogEntry[];
}

const props = defineProps<Props>();
const emit = defineEmits<{ clear: [] }>();

const containerRef = ref<HTMLElement | null>(null);
const autoScroll = ref(true);

const onScroll = () => {
  const el = containerRef.value;
  if (!el) return;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  autoScroll.value = distance < 40;
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
  if (stream === 'stderr') return 'text-stopped';
  if (stream === 'system') return 'text-accent';
  return 'text-ink/90';
};
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-log">
    <div class="flex items-center justify-between border-b border-line px-4 py-2">
      <div class="text-xs text-muted">
        Log Viewer
        <span class="ml-2" :class="autoScroll ? 'text-running' : 'text-warn'">
          {{ autoScroll ? 'auto-scroll on' : 'auto-scroll paused' }}
        </span>
      </div>
      <IconButton label="Clear Log" variant="ghost" @click="emit('clear')" />
    </div>
    <div
      ref="containerRef"
      class="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-5"
      @scroll="onScroll"
    >
      <p v-if="logs.length === 0" class="text-muted">
        Belum ada log. Start project untuk melihat output.
      </p>
      <div
        v-for="(entry, index) in logs"
        :key="`${entry.ts}-${index}`"
        class="whitespace-pre-wrap break-all"
        :class="lineClass(entry.stream)"
      >
        {{ entry.line }}
      </div>
    </div>
  </section>
</template>
