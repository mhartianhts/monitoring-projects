<script setup lang="ts">
import type { CommandExecutionResult } from "../../types/project";

defineProps<{
  outputs: CommandExecutionResult[];
}>();
</script>

<template>
  <div v-if="outputs && outputs.length > 0" class="my-3 space-y-2">
    <div
      v-for="(out, idx) in outputs"
      :key="idx"
      class="rounded-md border border-line bg-black/80 font-mono text-xs overflow-hidden"
    >
      <div class="flex items-center justify-between border-b border-line/40 bg-white/5 px-3 py-1.5 text-muted">
        <div class="flex items-center gap-2 truncate">
          <span
            class="h-2 w-2 rounded-full"
            :class="out.exitCode === 0 ? 'bg-accent' : 'bg-stopped'"
          />
          <span class="font-semibold text-ink">$ {{ out.command }}</span>
        </div>
        <span class="text-[10px] text-muted">{{ out.durationMs }}ms</span>
      </div>

      <div class="p-3 text-ink/90 space-y-1 overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
        <div v-if="out.stdout" class="text-emerald-400 font-mono text-xs">
          {{ out.stdout }}
        </div>
        <div v-if="out.stderr" class="text-rose-400 font-mono text-xs">
          {{ out.stderr }}
        </div>
        <div v-if="out.error" class="text-stopped font-mono text-xs font-semibold">
          Error: {{ out.error }}
        </div>
      </div>
    </div>
  </div>
</template>
