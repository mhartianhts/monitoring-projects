<script setup lang="ts">
import { ref, computed } from "vue";
import { useOpenApiStore } from "../../stores/openapi.store";

const store = useOpenApiStore();
const copied = ref(false);

const openApiJsonString = computed(() => {
  if (!store.specData?.openApiDoc) return "";
  return JSON.stringify(store.specData.openApiDoc, null, 2);
});

const copySpec = async () => {
  if (!openApiJsonString.value) return;
  await navigator.clipboard.writeText(openApiJsonString.value);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
};

const downloadSpec = () => {
  if (!openApiJsonString.value) return;
  const blob = new Blob([openApiJsonString.value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${store.specData?.projectName || "openapi"}-spec.json`;
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <div class="flex h-full flex-1 flex-col bg-base overflow-hidden p-4 space-y-3">
    <!-- Header Bar -->
    <div class="flex items-center justify-between border-b border-line pb-3">
      <div class="space-y-1">
        <h2 class="text-sm font-bold text-ink font-mono flex items-center gap-2">
          <span>📜</span> OpenAPI 3.0.3 Specification Document
        </h2>
        <p class="text-[11px] text-muted font-mono">
          Ready to import into Postman, Swagger UI, Insomnia, or API Gateways.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line transition shadow-xs font-mono"
          @click="copySpec"
        >
          <span>📋</span>
          <span>{{ copied ? 'Copied JSON!' : 'Copy JSON' }}</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-accent-dim transition shadow-xs font-mono"
          @click="downloadSpec"
        >
          <span>💾</span>
          <span>Download openapi.json</span>
        </button>
      </div>
    </div>

    <!-- JSON Spec Box -->
    <div class="flex-1 overflow-hidden rounded-xl border border-line bg-panel p-3">
      <pre
        class="h-full w-full overflow-auto text-xs font-mono text-ink leading-relaxed p-2"
      >{{ openApiJsonString }}</pre>
    </div>
  </div>
</template>
