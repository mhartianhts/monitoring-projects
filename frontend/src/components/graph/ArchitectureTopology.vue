<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useCodeGraphStore } from "../../stores/codeGraph.store";
import type { IGraphNode, GraphLayerType } from "../../types/codeGraph.types";

const store = useCodeGraphStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Transform state (Pan & Zoom)
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const isDraggingCanvas = ref(false);
const draggedNode = ref<IGraphNode | null>(null);
const dragStart = { x: 0, y: 0 };

let animationFrameId: number | null = null;
const simulationNodes = ref<IGraphNode[]>([]);

// Node color palette per layer
const layerColors: Record<GraphLayerType, { bg: string; border: string; glow: string }> = {
  route: { bg: "#06b6d4", border: "#0891b2", glow: "rgba(6, 182, 212, 0.4)" },
  controller: { bg: "#3b82f6", border: "#2563eb", glow: "rgba(59, 130, 246, 0.4)" },
  service: { bg: "#a855f7", border: "#9333ea", glow: "rgba(168, 85, 247, 0.4)" },
  model: { bg: "#10b981", border: "#059669", glow: "rgba(16, 185, 129, 0.4)" },
  middleware: { bg: "#f59e0b", border: "#d97706", glow: "rgba(245, 158, 11, 0.4)" },
  component: { bg: "#f43f5e", border: "#e11d48", glow: "rgba(244, 63, 94, 0.4)" },
  store: { bg: "#6366f1", border: "#4f46e5", glow: "rgba(99, 102, 241, 0.4)" },
  util: { bg: "#64748b", border: "#475569", glow: "rgba(100, 116, 139, 0.3)" },
  config: { bg: "#78716c", border: "#57534e", glow: "rgba(120, 113, 108, 0.3)" },
  test: { bg: "#ec4899", border: "#db2777", glow: "rgba(236, 72, 153, 0.3)" },
  other: { bg: "#4b5563", border: "#374151", glow: "rgba(75, 85, 99, 0.3)" },
};

// Initialize positions
const initNodePositions = () => {
  const nodes = store.filteredNodes;
  const canvas = canvasRef.value;
  const width = canvas ? canvas.width : 800;
  const height = canvas ? canvas.height : 600;

  if (store.layoutMode === "column") {
    // Hierarchical Column Layout (Routes -> Controllers -> Services -> Models -> Others)
    const columns: Record<string, IGraphNode[]> = {
      route: [],
      controller: [],
      service: [],
      model: [],
      middleware: [],
      other: [],
    };

    for (const n of nodes) {
      if (columns[n.layer]) {
        columns[n.layer].push(n);
      } else {
        columns.other.push(n);
      }
    }

    const colOrder = ["route", "controller", "service", "model", "middleware", "other"];
    const activeCols = colOrder.filter((k) => columns[k].length > 0);
    const colWidth = (width - 160) / Math.max(1, activeCols.length - 1 || 1);

    simulationNodes.value = nodes.map((n) => {
      const colIdx = activeCols.indexOf(columns[n.layer] ? n.layer : "other");
      const colItems = columns[n.layer] || columns.other;
      const rowIdx = colItems.indexOf(n);
      const rowSpacing = Math.min(65, (height - 120) / Math.max(1, colItems.length));

      return {
        ...n,
        x: 80 + colIdx * colWidth,
        y: 60 + rowIdx * rowSpacing,
        vx: 0,
        vy: 0,
      };
    });
  } else {
    // Force-Directed Radial Layout
    simulationNodes.value = nodes.map((n, idx) => {
      const angle = (idx / nodes.length) * 2 * Math.PI;
      const radius = 180 + (idx % 3) * 60;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });
  }
};

// Simple Force Physics Tick
const stepSimulation = () => {
  if (store.layoutMode === "column") return; // static layout

  const nodes = simulationNodes.value;
  const edges = store.filteredEdges;
  const canvas = canvasRef.value;
  if (!canvas || nodes.length === 0) return;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // 1. Node Repulsion (Coulomb's Law)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const n1 = nodes[i];
      const n2 = nodes[j];
      const dx = (n1.x || 0) - (n2.x || 0);
      const dy = (n1.y || 0) - (n2.y || 0);
      const distSq = dx * dx + dy * dy || 1;
      const dist = Math.sqrt(distSq);

      if (dist < 220) {
        const force = 3500 / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (draggedNode.value?.id !== n1.id) {
          n1.vx = (n1.vx || 0) + fx;
          n1.vy = (n1.vy || 0) + fy;
        }
        if (draggedNode.value?.id !== n2.id) {
          n2.vx = (n2.vx || 0) - fx;
          n2.vy = (n2.vy || 0) - fy;
        }
      }
    }
  }

  // 2. Edge Attraction (Hooke's Law)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) continue;

    const dx = (t.x || 0) - (s.x || 0);
    const dy = (t.y || 0) - (s.y || 0);
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDist = 110;
    const force = (dist - targetDist) * 0.04;

    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    if (draggedNode.value?.id !== s.id) {
      s.vx = (s.vx || 0) + fx;
      s.vy = (s.vy || 0) + fy;
    }
    if (draggedNode.value?.id !== t.id) {
      t.vx = (t.vx || 0) - fx;
      t.vy = (t.vy || 0) - fy;
    }
  }

  // 3. Center Gravity & Damping Velocity
  for (const n of nodes) {
    if (draggedNode.value?.id === n.id) continue;

    const dx = cx - (n.x || cx);
    const dy = cy - (n.y || cy);
    n.vx = (n.vx || 0) * 0.85 + dx * 0.01;
    n.vy = (n.vy || 0) * 0.85 + dy * 0.01;

    n.x = (n.x || 0) + (n.vx || 0);
    n.y = (n.y || 0) + (n.vy || 0);
  }
};

// Render Canvas
const draw = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  stepSimulation();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(panX.value, panY.value);
  ctx.scale(zoom.value, zoom.value);

  const nodes = simulationNodes.value;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges = store.filteredEdges;
  const selectedId = store.selectedNodeId;
  const connectedIds = store.connectedInfo.connectedNodeIds;
  const connectedEdgeIds = store.connectedInfo.connectedEdgeIds;

  // 1. Draw Edges (Directed Lines / Curves)
  for (const e of edges) {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t || s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue;

    const isConnected = connectedEdgeIds.has(e.id);
    const isFaded = selectedId && !isConnected;

    ctx.beginPath();
    ctx.lineWidth = isConnected ? 2.5 : 1;
    ctx.strokeStyle = isConnected
      ? "#38bdf8"
      : isFaded
      ? "rgba(100, 116, 139, 0.1)"
      : "rgba(148, 163, 184, 0.35)";

    if (store.layoutMode === "column") {
      // Curved Bezier
      const midX = (s.x + t.x) / 2;
      ctx.moveTo(s.x, s.y);
      ctx.bezierCurveTo(midX, s.y, midX, t.y, t.x, t.y);
    } else {
      // Straight line
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
    }
    ctx.stroke();

    // Arrow indicator on target
    if (!isFaded) {
      const angle = Math.atan2(t.y - s.y, t.x - s.x);
      const arrowRadius = 18;
      const ax = t.x - Math.cos(angle) * arrowRadius;
      const ay = t.y - Math.sin(angle) * arrowRadius;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.fillStyle = isConnected ? "#38bdf8" : "rgba(148, 163, 184, 0.5)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6, -3);
      ctx.lineTo(-6, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 2. Draw Nodes
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;

    const isSelected = selectedId === n.id;
    const isConnected = connectedIds.has(n.id);
    const isFaded = selectedId && !isSelected && !isConnected;
    const colors = layerColors[n.layer] || layerColors.other;

    const radius = isSelected ? 16 : isConnected ? 13 : 10;

    // Glowing halo for selected / connected
    if (isSelected || isConnected) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "rgba(56, 189, 248, 0.4)" : colors.glow;
      ctx.fill();
    }

    // Node Circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isFaded ? "rgba(75, 85, 99, 0.25)" : colors.bg;
    ctx.fill();
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeStyle = isSelected ? "#ffffff" : isFaded ? "rgba(55, 65, 81, 0.4)" : colors.border;
    ctx.stroke();

    // Node Label text
    ctx.font = isSelected ? "bold 11px monospace" : "10px monospace";
    ctx.fillStyle = isSelected
      ? "#38bdf8"
      : isFaded
      ? "rgba(148, 163, 184, 0.2)"
      : "#f8fafc";
    ctx.textAlign = "center";
    ctx.fillText(n.name, n.x, n.y + radius + 14);

    // Layer type sub-label
    if (isSelected || zoom.value > 1.2) {
      ctx.font = "8px monospace";
      ctx.fillStyle = isFaded ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.8)";
      ctx.fillText(n.layer.toUpperCase(), n.x, n.y + radius + 24);
    }
  }

  ctx.restore();

  animationFrameId = requestAnimationFrame(draw);
};

// Canvas Mouse Interactions (Pan, Zoom, Drag, Click)
const handleMouseDown = (e: MouseEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left - panX.value) / zoom.value;
  const mouseY = (e.clientY - rect.top - panY.value) / zoom.value;

  // Check if clicked on a node
  const hit = simulationNodes.value.find((n) => {
    if (n.x === undefined || n.y === undefined) return false;
    const dist = Math.hypot(n.x - mouseX, n.y - mouseY);
    return dist <= 20;
  });

  if (hit) {
    draggedNode.value = hit;
    store.selectNode(hit.id);
  } else {
    isDraggingCanvas.value = true;
    dragStart.x = e.clientX - panX.value;
    dragStart.y = e.clientY - panY.value;
  }
};

const handleMouseMove = (e: MouseEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  if (draggedNode.value) {
    draggedNode.value.x = (e.clientX - rect.left - panX.value) / zoom.value;
    draggedNode.value.y = (e.clientY - rect.top - panY.value) / zoom.value;
    draggedNode.value.vx = 0;
    draggedNode.value.vy = 0;
  } else if (isDraggingCanvas.value) {
    panX.value = e.clientX - dragStart.x;
    panY.value = e.clientY - dragStart.y;
  }
};

const handleMouseUp = () => {
  draggedNode.value = null;
  isDraggingCanvas.value = false;
};

const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(3, Math.max(0.3, zoom.value * delta));
  zoom.value = newZoom;
};

const resetView = () => {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
  initNodePositions();
};

const resizeCanvas = () => {
  const canvas = canvasRef.value;
  if (canvas && canvas.parentElement) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
};

watch(
  () => [store.filteredNodes, store.layoutMode],
  () => {
    initNodePositions();
  },
  { deep: true }
);

onMounted(() => {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  initNodePositions();
  animationFrameId = requestAnimationFrame(draw);
});

onUnmounted(() => {
  window.removeEventListener("resize", resizeCanvas);
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<template>
  <div class="relative h-full w-full bg-base overflow-hidden select-none">
    <!-- Canvas Element -->
    <canvas
      ref="canvasRef"
      class="h-full w-full cursor-grab active:cursor-grabbing"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @wheel="handleWheel"
    ></canvas>

    <!-- Floating Canvas Controls Overlay -->
    <div class="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-lg border border-line bg-panel/90 backdrop-blur-md p-1.5 shadow-xl">
      <button
        type="button"
        class="h-7 w-7 rounded bg-elevated text-xs font-bold text-ink hover:bg-line transition flex items-center justify-center"
        title="Zoom In"
        @click="zoom = Math.min(3, zoom * 1.2)"
      >
        +
      </button>
      <button
        type="button"
        class="h-7 w-7 rounded bg-elevated text-xs font-bold text-ink hover:bg-line transition flex items-center justify-center"
        title="Zoom Out"
        @click="zoom = Math.max(0.3, zoom * 0.8)"
      >
        -
      </button>
      <button
        type="button"
        class="h-7 px-2 rounded bg-elevated text-[10px] font-mono font-bold text-ink hover:bg-line transition flex items-center justify-center"
        title="Reset Zoom & Centering"
        @click="resetView"
      >
        Reset
      </button>
      <span class="px-1 text-[10px] font-mono text-muted">{{ (zoom * 100).toFixed(0) }}%</span>
    </div>

    <!-- Mode Badge -->
    <div class="absolute top-4 left-4 flex items-center gap-2 rounded-lg border border-line bg-panel/90 backdrop-blur-md px-3 py-1.5 text-xs shadow-md">
      <span class="h-2 w-2 rounded-full bg-accent animate-pulse"></span>
      <span class="font-mono text-[11px] font-semibold text-ink">
        {{ store.layoutMode === 'force' ? 'Physics Radial Topology' : 'Hierarchical Columns' }}
      </span>
      <span class="text-muted text-[10px] font-mono">({{ store.filteredNodes.length }} nodes)</span>
    </div>
  </div>
</template>
