export type SpanType = "http" | "database" | "middleware" | "compute" | "cache" | "external";

export interface ISpan {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  service: string;
  type: SpanType;
  durationMs: number;
  offsetMs: number;
  status: "success" | "error";
  error?: string | null;
  metadata?: Record<string, any>;
}

export interface ITrace {
  traceId: string;
  projectId: string;
  service: string;
  name: string;
  method: string;
  path: string;
  startTime: number;
  durationMs: number;
  status: "success" | "error";
  statusCode: number;
  spansCount: number;
  spans: ISpan[];
  clientIp?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface ITraceStats {
  totalRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRatePct: number;
  slowTracesCount: number;
  layerBreakdown: {
    http: number;
    database: number;
    middleware: number;
    compute: number;
    cache: number;
    external: number;
  };
}

export interface ITraceListResponse {
  total: number;
  limit: number;
  offset: number;
  items: ITrace[];
}
