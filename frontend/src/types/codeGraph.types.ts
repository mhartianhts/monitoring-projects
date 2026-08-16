export type GraphLayerType =
  | "route"
  | "controller"
  | "service"
  | "model"
  | "middleware"
  | "component"
  | "store"
  | "util"
  | "config"
  | "test"
  | "other";

export interface IGraphNode {
  id: string; // relative path e.g. "src/routes/ai.routes.js"
  name: string; // "ai.routes.js"
  relPath: string;
  layer: GraphLayerType;
  ext: string;
  linesCount: number;
  sizeBytes: number;
  inDegree: number; // callers count
  outDegree: number; // dependencies count
  isOrphan: boolean;
  isEntry: boolean;

  // Simulation coordinates & velocities
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface IGraphEdge {
  id: string;
  source: string; // source node id
  target: string; // target node id
  sourceLayer: GraphLayerType;
  targetLayer: GraphLayerType;
}

export interface IGraphStats {
  totalFiles: number;
  totalConnections: number;
  totalLines: number;
  healthScore: number;
  orphanCount: number;
  circularCyclesCount: number;
  cycles: string[][];
  layerCounts: Record<GraphLayerType, number>;
}

export interface ICodeGraphData {
  projectId: string;
  projectName: string;
  projectType: string;
  nodes: IGraphNode[];
  edges: IGraphEdge[];
  stats: IGraphStats;
}
