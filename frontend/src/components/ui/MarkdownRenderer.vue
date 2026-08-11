<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";

const props = defineProps<{
  content: string;
}>();

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true,
});

const renderedHtml = computed(() => {
  if (!props.content) return "";
  try {
    return marked.parse(props.content) as string;
  } catch {
    return props.content;
  }
});
</script>

<template>
  <div
    class="markdown-body text-sm text-ink leading-relaxed"
    v-html="renderedHtml"
  />
</template>
