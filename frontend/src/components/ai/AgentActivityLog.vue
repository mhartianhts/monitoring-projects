<script setup lang="ts">
import type { AgentStep } from "../../types/project";

defineProps<{
  steps: AgentStep[];
}>();
</script>

<template>
  <div v-if="steps && steps.length > 0" class="my-3 rounded-md border border-line bg-elevated/40 p-3 text-xs">
    <div class="mb-2 flex items-center justify-between">
      <span class="font-semibold uppercase tracking-wider text-muted text-[10px]">
        Agent Activity Log
      </span>
      <span class="font-mono text-[10px] text-muted">{{ steps.length }} step(s)</span>
    </div>

    <div class="space-y-1.5 font-mono">
      <div
        v-for="step in steps"
        :key="step.id"
        class="flex items-start gap-2 rounded px-2 py-1 text-ink transition"
        :class="{
          'bg-accent/10 border-l-2 border-accent': step.status === 'pending',
          'bg-panel/50': step.status === 'success',
          'bg-stopped/10 border-l-2 border-stopped text-stopped': step.status === 'error',
        }"
      >
        <span class="shrink-0">
          <span v-if="step.status === 'success'" class="text-accent">✓</span>
          <span v-else-if="step.status === 'pending'" class="animate-pulse text-warn">●</span>
          <span v-else class="text-stopped">✗</span>
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between">
            <span class="font-medium truncate">{{ step.title }}</span>
            <span class="text-[10px] text-muted uppercase tracking-wider ml-2">{{ step.type }}</span>
          </div>
          <p v-if="step.details" class="text-[11px] text-muted truncate mt-0.5 font-sans">
            {{ step.details }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
