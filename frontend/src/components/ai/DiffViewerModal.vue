<script setup lang="ts">
import type { FileDiffInfo } from "../../types/project";

defineProps<{
  diff: FileDiffInfo | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <div
    v-if="diff"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
  >
    <div
      class="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg border border-line bg-panel shadow-2xl"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-line px-5 py-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="rounded bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
            {{ diff.isNew ? "NEW FILE" : "MODIFIED" }}
          </span>
          <h3 class="truncate text-sm font-semibold font-mono text-ink">{{ diff.path }}</h3>
        </div>
        <button
          type="button"
          class="rounded px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-ink"
          @click="emit('close')"
        >
          ✕ Close
        </button>
      </div>

      <!-- Diff Content -->
      <div class="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed space-y-4">
        <div v-if="diff.originalContent !== null" class="space-y-1">
          <div class="text-stopped font-semibold text-[11px] uppercase tracking-wider">
            - Sebelum Perubahan:
          </div>
          <pre
            class="max-h-60 overflow-x-auto rounded border border-stopped/30 bg-stopped/10 p-3 text-ink/80 whitespace-pre-wrap"
          >{{ diff.originalContent }}</pre>
        </div>

        <div class="space-y-1">
          <div class="text-accent font-semibold text-[11px] uppercase tracking-wider">
            + Sesudah Perubahan (Baru):
          </div>
          <pre
            class="max-h-60 overflow-x-auto rounded border border-accent/30 bg-accent/10 p-3 text-ink whitespace-pre-wrap"
          >{{ diff.newContent }}</pre>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end border-t border-line px-5 py-3">
        <button
          type="button"
          class="rounded bg-elevated px-4 py-1.5 text-xs font-medium text-ink hover:bg-elevated/80"
          @click="emit('close')"
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
</template>
