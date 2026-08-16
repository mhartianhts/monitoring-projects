<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import { notify } from "../../services/notification.service";

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

const handleContentClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (target && target.matches('pre code')) {
    const text = target.innerText;
    void navigator.clipboard.writeText(text).then(() => {
      notify.toast('Kode tersalin ke clipboard', 'success');
    });
  }
};
</script>

<template>
  <div
    class="markdown-body text-sm text-ink leading-relaxed select-text"
    @click="handleContentClick"
    v-html="renderedHtml"
  />
</template>
