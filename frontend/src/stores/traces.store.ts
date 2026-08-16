import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "../services/api";
import { getSocket } from "../composables/useSocket";
import type { ITrace, ITraceStats, ISpan } from "../types/trace.types";

export const useTracesStore = defineStore("traces", () => {
  const traces = ref<ITrace[]>([]);
  const selectedTraceId = ref<string | null>(null);
  const selectedSpanId = ref<string | null>(null);
  const stats = ref<ITraceStats | null>(null);
  const loading = ref(false);
  const statsLoading = ref(false);
  const actionLoading = ref(false);
  const error = ref<string | null>(null);

  // Filters
  const search = ref("");
  const statusFilter = ref<"all" | "success" | "error" | "slow">("all");
  const methodFilter = ref<string>("all");
  const projectFilter = ref<string>("all");
  const isAutoRefresh = ref(true);

  let socketBound = false;

  const selectedTrace = computed(() =>
    traces.value.find((t) => t.traceId === selectedTraceId.value) || null
  );

  const selectedSpan = computed<ISpan | null>(() => {
    if (!selectedTrace.value || !selectedSpanId.value) return null;
    return selectedTrace.value.spans.find((s) => s.spanId === selectedSpanId.value) || null;
  });

  const filteredTraces = computed(() => {
    let list = [...traces.value];

    if (projectFilter.value !== "all") {
      list = list.filter((t) => t.projectId === projectFilter.value);
    }

    if (statusFilter.value === "success") {
      list = list.filter((t) => t.status === "success" && t.statusCode < 400);
    } else if (statusFilter.value === "error") {
      list = list.filter((t) => t.status === "error" || t.statusCode >= 400);
    } else if (statusFilter.value === "slow") {
      list = list.filter((t) => t.durationMs >= 400);
    }

    if (methodFilter.value !== "all") {
      list = list.filter((t) => t.method.toUpperCase() === methodFilter.value.toUpperCase());
    }

    if (search.value.trim()) {
      const q = search.value.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.path.toLowerCase().includes(q) ||
          t.traceId.toLowerCase().includes(q) ||
          t.projectId.toLowerCase().includes(q) ||
          t.spans.some((s) => s.name.toLowerCase().includes(q))
      );
    }

    return list;
  });

  const fetchTraces = async () => {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.listTraces({
        projectId: projectFilter.value !== "all" ? projectFilter.value : undefined,
        search: search.value || undefined,
        limit: 150,
      });
      traces.value = res.items || [];
      if (!selectedTraceId.value && traces.value.length > 0) {
        selectedTraceId.value = traces.value[0].traceId;
      }
    } catch (err: any) {
      error.value = err.message || "Gagal memuat daftar trace";
    } finally {
      loading.value = false;
    }
  };

  const fetchStats = async () => {
    statsLoading.value = true;
    try {
      const data = await api.getTraceStats(projectFilter.value);
      stats.value = data;
    } catch (err: any) {
      console.error("Failed to fetch trace stats:", err);
    } finally {
      statsLoading.value = false;
    }
  };

  const selectTrace = (traceId: string) => {
    selectedTraceId.value = traceId;
    selectedSpanId.value = null; // reset selected span
  };

  const selectSpan = (spanId: string | null) => {
    selectedSpanId.value = spanId;
  };

  const clearAllTraces = async () => {
    actionLoading.value = true;
    try {
      await api.clearTraces(projectFilter.value);
      traces.value = [];
      selectedTraceId.value = null;
      selectedSpanId.value = null;
      await fetchStats();
    } catch (err: any) {
      error.value = err.message || "Gagal menghapus traces";
    } finally {
      actionLoading.value = false;
    }
  };

  const generateDemo = async (count = 6) => {
    actionLoading.value = true;
    try {
      await api.generateMockTraces(count, projectFilter.value !== "all" ? projectFilter.value : "backend-aira");
      await Promise.all([fetchTraces(), fetchStats()]);
    } catch (err: any) {
      error.value = err.message || "Gagal men-generate demo trace";
    } finally {
      actionLoading.value = false;
    }
  };

  const bindSocket = () => {
    if (socketBound) return;
    socketBound = true;
    const socket = getSocket();

    socket.on("trace:new", (newTrace: ITrace) => {
      if (!isAutoRefresh.value) return;

      // Prepend trace
      const existingIdx = traces.value.findIndex((t) => t.traceId === newTrace.traceId);
      if (existingIdx >= 0) {
        traces.value[existingIdx] = newTrace;
      } else {
        traces.value.unshift(newTrace);
        if (traces.value.length > 500) {
          traces.value.pop();
        }
      }

      // Auto-select if first trace
      if (!selectedTraceId.value) {
        selectedTraceId.value = newTrace.traceId;
      }

      // Re-fetch stats debounced
      void fetchStats();
    });

    socket.on("trace:cleared", () => {
      traces.value = [];
      selectedTraceId.value = null;
      selectedSpanId.value = null;
      void fetchStats();
    });
  };

  return {
    traces,
    selectedTraceId,
    selectedSpanId,
    selectedTrace,
    selectedSpan,
    stats,
    loading,
    statsLoading,
    actionLoading,
    error,
    search,
    statusFilter,
    methodFilter,
    projectFilter,
    isAutoRefresh,
    filteredTraces,
    fetchTraces,
    fetchStats,
    selectTrace,
    selectSpan,
    clearAllTraces,
    generateDemo,
    bindSocket,
  };
});
