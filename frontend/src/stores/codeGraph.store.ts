import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "../services/api";
import type { ICodeGraphData, IGraphNode, GraphLayerType } from "../types/codeGraph.types";

export const useCodeGraphStore = defineStore("codeGraph", () => {
  const graphData = ref<ICodeGraphData | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const hoveredNodeId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Filters & Controls
  const search = ref("");
  const layoutMode = ref<"force" | "column">("force");
  const selectedLayers = ref<Set<GraphLayerType>>(
    new Set([
      "route",
      "controller",
      "service",
      "model",
      "middleware",
      "component",
      "store",
      "util",
      "config",
      "test",
      "other",
    ])
  );

  const selectedNode = computed<IGraphNode | null>(() => {
    if (!graphData.value || !selectedNodeId.value) return null;
    return graphData.value.nodes.find((n) => n.id === selectedNodeId.value) || null;
  });

  // Calculate connected nodes & edges for the selected node
  const connectedInfo = computed(() => {
    if (!graphData.value || !selectedNodeId.value) {
      return {
        incoming: [] as IGraphNode[],
        outgoing: [] as IGraphNode[],
        connectedNodeIds: new Set<string>(),
        connectedEdgeIds: new Set<string>(),
      };
    }

    const targetId = selectedNodeId.value;
    const incoming: IGraphNode[] = [];
    const outgoing: IGraphNode[] = [];
    const connectedNodeIds = new Set<string>([targetId]);
    const connectedEdgeIds = new Set<string>();

    for (const edge of graphData.value.edges) {
      if (edge.target === targetId) {
        connectedEdgeIds.add(edge.id);
        connectedNodeIds.add(edge.source);
        const node = graphData.value.nodes.find((n) => n.id === edge.source);
        if (node) incoming.push(node);
      }
      if (edge.source === targetId) {
        connectedEdgeIds.add(edge.id);
        connectedNodeIds.add(edge.target);
        const node = graphData.value.nodes.find((n) => n.id === edge.target);
        if (node) outgoing.push(node);
      }
    }

    return { incoming, outgoing, connectedNodeIds, connectedEdgeIds };
  });

  // Filtered nodes based on search & layer toggles
  const filteredNodes = computed(() => {
    if (!graphData.value) return [];
    let list = graphData.value.nodes.filter((n) => selectedLayers.value.has(n.layer));

    if (search.value.trim()) {
      const q = search.value.trim().toLowerCase();
      list = list.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.relPath.toLowerCase().includes(q) ||
          n.layer.toLowerCase().includes(q)
      );
    }
    return list;
  });

  const visibleNodeIds = computed(() => new Set(filteredNodes.value.map((n) => n.id)));

  // Filtered edges where both source and target are visible
  const filteredEdges = computed(() => {
    if (!graphData.value) return [];
    const visible = visibleNodeIds.value;
    return graphData.value.edges.filter((e) => visible.has(e.source) && visible.has(e.target));
  });

  const toggleLayer = (layer: GraphLayerType) => {
    const next = new Set(selectedLayers.value);
    if (next.has(layer)) {
      next.delete(layer);
    } else {
      next.add(layer);
    }
    selectedLayers.value = next;
  };

  const selectAllLayers = () => {
    selectedLayers.value = new Set([
      "route",
      "controller",
      "service",
      "model",
      "middleware",
      "component",
      "store",
      "util",
      "config",
      "test",
      "other",
    ]);
  };

  const selectCoreLayers = () => {
    selectedLayers.value = new Set(["route", "controller", "service", "model", "middleware"]);
  };

  const fetchGraph = async (projectId: string) => {
    if (!projectId) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await api.getCodeGraph(projectId);
      graphData.value = data;
      // Auto select first entry or route node
      if (!selectedNodeId.value && data.nodes.length > 0) {
        const candidate =
          data.nodes.find((n) => n.isEntry) ||
          data.nodes.find((n) => n.layer === "route") ||
          data.nodes[0];
        selectedNodeId.value = candidate.id;
      }
    } catch (err: any) {
      error.value = err.message || "Gagal memuat arsitektur graph project";
    } finally {
      loading.value = false;
    }
  };

  const selectNode = (nodeId: string | null) => {
    selectedNodeId.value = nodeId;
  };

  const setHoveredNode = (nodeId: string | null) => {
    hoveredNodeId.value = nodeId;
  };

  return {
    graphData,
    selectedNodeId,
    hoveredNodeId,
    selectedNode,
    connectedInfo,
    loading,
    error,
    search,
    layoutMode,
    selectedLayers,
    filteredNodes,
    filteredEdges,
    visibleNodeIds,
    toggleLayer,
    selectAllLayers,
    selectCoreLayers,
    fetchGraph,
    selectNode,
    setHoveredNode,
  };
});
