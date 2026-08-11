<script setup lang="ts">
interface Props {
  label: string;
  disabled?: boolean;
  variant?: 'default' | 'accent' | 'danger' | 'ghost';
}

withDefaults(defineProps<Props>(), {
  disabled: false,
  variant: 'default',
});

defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    class="rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
    :class="{
      'bg-elevated text-ink hover:bg-line border border-line': variant === 'default',
      'bg-accent text-base hover:bg-accent-dim': variant === 'accent',
      'bg-stopped/20 text-stopped border border-stopped/40 hover:bg-stopped/30': variant === 'danger',
      'bg-transparent text-muted hover:text-ink hover:bg-elevated': variant === 'ghost',
    }"
    :disabled="disabled"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>
