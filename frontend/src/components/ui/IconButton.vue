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
    class="inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 select-none font-sans"
    :class="{
      'bg-elevated text-zinc-200 hover:bg-zinc-800 border border-line': variant === 'default',
      'bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-400': variant === 'accent',
      'bg-rose-950/40 text-rose-300 border border-rose-900/60 hover:bg-rose-950/70': variant === 'danger',
      'bg-transparent text-zinc-400 hover:text-white hover:bg-elevated border border-transparent hover:border-line': variant === 'ghost',
    }"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <slot name="icon" />
    <span>{{ label }}</span>
  </button>
</template>
