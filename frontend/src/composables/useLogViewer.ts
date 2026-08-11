import { nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";

export const useLogViewer = (logs: Ref<unknown[]>) => {
  const containerRef = ref<HTMLElement | null>(null);
  const autoScroll = ref(true);

  const onScroll = () => {
    const el = containerRef.value;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScroll.value = distance < 40;
  };

  const scrollToBottom = async () => {
    await nextTick();
    const el = containerRef.value;
    if (!el || !autoScroll.value) return;
    el.scrollTop = el.scrollHeight;
  };

  const stopWatch = watch(
    () => logs.value.length,
    () => {
      void scrollToBottom();
    },
  );

  onBeforeUnmount(() => {
    stopWatch();
  });

  return {
    containerRef,
    autoScroll,
    onScroll,
  };
};
