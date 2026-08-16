import crypto from "node:crypto";

class TracesService {
  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    this.traces = []; // sorted newest first
    this.io = null;
  }

  setSocket(io) {
    this.io = io;
  }

  /**
   * Ingest a single trace or array of traces
   */
  ingest(payload, projectId = "default") {
    const rawList = Array.isArray(payload) ? payload : [payload];
    const newTraces = [];

    for (const item of rawList) {
      if (!item || !item.name) continue;

      const traceId = item.traceId || `tr-${crypto.randomUUID().slice(0, 8)}`;
      const startTime = item.startTime || Date.now();
      const durationMs = typeof item.durationMs === "number" ? Math.max(0, item.durationMs) : 0;
      const status = item.status || (item.statusCode >= 400 ? "error" : "success");
      const statusCode = item.statusCode || (status === "error" ? 500 : 200);

      // Process and normalize spans
      const spans = (Array.isArray(item.spans) ? item.spans : []).map((span, idx) => ({
        spanId: span.spanId || `sp-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
        parentSpanId: span.parentSpanId || null,
        name: span.name || "Operation",
        service: span.service || item.service || projectId || "backend",
        type: span.type || "http", // 'http' | 'database' | 'middleware' | 'compute' | 'cache' | 'external'
        durationMs: typeof span.durationMs === "number" ? span.durationMs : 0,
        offsetMs: typeof span.offsetMs === "number" ? span.offsetMs : 0,
        metadata: span.metadata || {},
        status: span.status || "success",
        error: span.error || null,
      }));

      // If no spans provided, create a default root span
      if (spans.length === 0) {
        spans.push({
          spanId: `sp-root-${crypto.randomUUID().slice(0, 4)}`,
          parentSpanId: null,
          name: item.name,
          service: item.service || projectId || "backend",
          type: "http",
          durationMs,
          offsetMs: 0,
          metadata: item.metadata || {},
          status,
        });
      }

      const trace = {
        traceId,
        projectId: item.projectId || projectId,
        service: item.service || projectId || "backend",
        name: item.name,
        method: item.method || (item.name.includes(" ") ? item.name.split(" ")[0] : "GET"),
        path: item.path || (item.name.includes(" ") ? item.name.split(" ").slice(1).join(" ") : item.name),
        startTime,
        durationMs: Number(durationMs.toFixed(2)),
        status,
        statusCode,
        spansCount: spans.length,
        spans,
        clientIp: item.clientIp || null,
        userAgent: item.userAgent || null,
        createdAt: new Date().toISOString(),
      };

      // Add to memory ring buffer (newest at index 0)
      this.traces.unshift(trace);
      if (this.traces.length > this.maxSize) {
        this.traces.pop();
      }

      newTraces.push(trace);

      // Emit realtime event via Socket.IO
      if (this.io) {
        this.io.emit("trace:new", trace);
        if (trace.projectId) {
          this.io.to(`project:${trace.projectId}`).emit("trace:new", trace);
        }
      }
    }

    return newTraces;
  }

  /**
   * List traces with filtering
   */
  list({ projectId, search, status, minDuration, limit = 100, offset = 0 } = {}) {
    let result = this.traces;

    if (projectId && projectId !== "all") {
      result = result.filter((t) => t.projectId === projectId);
    }

    if (status && status !== "all") {
      result = result.filter((t) => t.status === status);
    }

    if (minDuration) {
      const min = parseFloat(minDuration);
      if (!isNaN(min)) {
        result = result.filter((t) => t.durationMs >= min);
      }
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.path.toLowerCase().includes(q) ||
          t.traceId.toLowerCase().includes(q) ||
          (t.service && t.service.toLowerCase().includes(q))
      );
    }

    const total = result.length;
    const paginated = result.slice(Number(offset), Number(offset) + Number(limit));

    return {
      total,
      limit: Number(limit),
      offset: Number(offset),
      items: paginated,
    };
  }

  /**
   * Get single trace by ID with spans
   */
  getById(traceId) {
    return this.traces.find((t) => t.traceId === traceId) || null;
  }

  /**
   * Get aggregated performance statistics
   */
  getStats(projectId) {
    let list = this.traces;
    if (projectId && projectId !== "all") {
      list = list.filter((t) => t.projectId === projectId);
    }

    const total = list.length;
    if (total === 0) {
      return {
        totalRequests: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        errorRatePct: 0,
        slowTracesCount: 0,
        layerBreakdown: {
          http: 0,
          database: 0,
          middleware: 0,
          compute: 0,
          cache: 0,
          external: 0,
        },
      };
    }

    // Durations sorted ascending
    const durations = list.map((t) => t.durationMs).sort((a, b) => a - b);
    const sumDuration = durations.reduce((acc, v) => acc + v, 0);
    const avgLatencyMs = Number((sumDuration / total).toFixed(2));

    const p50 = durations[Math.floor(total * 0.5)] || 0;
    const p95 = durations[Math.floor(total * 0.95)] || durations[total - 1] || 0;
    const p99 = durations[Math.floor(total * 0.99)] || durations[total - 1] || 0;

    const errorCount = list.filter((t) => t.status === "error" || t.statusCode >= 400).length;
    const errorRatePct = Number(((errorCount / total) * 100).toFixed(1));
    const slowTracesCount = list.filter((t) => t.durationMs > 500).length;

    // Layer breakdown calculation across all spans
    const layerTime = {
      http: 0,
      database: 0,
      middleware: 0,
      compute: 0,
      cache: 0,
      external: 0,
    };

    let totalSpanTime = 0;
    for (const trace of list) {
      for (const span of trace.spans) {
        const type = span.type || "http";
        if (layerTime[type] !== undefined) {
          layerTime[type] += span.durationMs;
          totalSpanTime += span.durationMs;
        }
      }
    }

    const layerBreakdown = {};
    for (const [layer, time] of Object.entries(layerTime)) {
      layerBreakdown[layer] = totalSpanTime > 0 ? Number(((time / totalSpanTime) * 100).toFixed(1)) : 0;
    }

    return {
      totalRequests: total,
      avgLatencyMs,
      p50LatencyMs: Number(p50.toFixed(2)),
      p95LatencyMs: Number(p95.toFixed(2)),
      p99LatencyMs: Number(p99.toFixed(2)),
      errorRatePct,
      slowTracesCount,
      layerBreakdown,
    };
  }

  /**
   * Clear traces
   */
  clear(projectId) {
    if (!projectId || projectId === "all") {
      this.traces = [];
    } else {
      this.traces = this.traces.filter((t) => t.projectId !== projectId);
    }
    if (this.io) {
      this.io.emit("trace:cleared", { projectId });
    }
    return { success: true };
  }

  /**
   * Generate realistic demo traces for quick testing & showcase
   */
  generateMockTraffic(count = 6, targetProjectId = "backend-aira") {
    const mockTemplates = [
      {
        method: "POST",
        path: "/api/v1/auth/login",
        name: "POST /api/v1/auth/login",
        statusCode: 200,
        status: "success",
        spans: [
          { name: "HTTP POST /api/v1/auth/login", type: "http", durationMs: 124.5, offsetMs: 0 },
          { name: "Middleware: rateLimiter & cors", type: "middleware", durationMs: 3.2, offsetMs: 0.5 },
          {
            name: "DB: SELECT * FROM users WHERE email = $1 LIMIT 1",
            type: "database",
            durationMs: 14.8,
            offsetMs: 4.1,
            metadata: { table: "users", rows: 1, queryTimeMs: 14.8 },
          },
          { name: "Crypto: bcrypt.compare(password, hash)", type: "compute", durationMs: 98.4, offsetMs: 19.5 },
          {
            name: "Cache: redis.setex session:token",
            type: "cache",
            durationMs: 4.1,
            offsetMs: 119.2,
            metadata: { key: "session:usr_992", ttl: 3600 },
          },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/products?limit=20&page=1",
        name: "GET /api/v1/products",
        statusCode: 200,
        status: "success",
        spans: [
          { name: "HTTP GET /api/v1/products", type: "http", durationMs: 48.2, offsetMs: 0 },
          { name: "Middleware: authGuard", type: "middleware", durationMs: 1.8, offsetMs: 0.4 },
          {
            name: "DB: SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC LIMIT 20",
            type: "database",
            durationMs: 32.5,
            offsetMs: 2.5,
            metadata: { table: "products", rows: 20, indexed: true },
          },
          { name: "JSON Serialization & Transform DTO", type: "compute", durationMs: 11.2, offsetMs: 36.2 },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/analytics/reports?period=monthly",
        name: "GET /api/v1/analytics/reports",
        statusCode: 200,
        status: "success",
        spans: [
          { name: "HTTP GET /api/v1/analytics/reports", type: "http", durationMs: 680.4, offsetMs: 0 },
          { name: "Middleware: authGuard & roleCheck", type: "middleware", durationMs: 2.5, offsetMs: 0.5 },
          {
            name: "DB: Heavy Aggregate Query (orders + transactions + items)",
            type: "database",
            durationMs: 540.2,
            offsetMs: 3.5,
            metadata: {
              table: "orders",
              warning: "⚠️ Slow query (> 500ms). Pertimbangkan composite index pada (created_at, status).",
              rowsExamined: 45020,
            },
          },
          {
            name: "External: Fetch Currency Rate from exchangerate.api",
            type: "external",
            durationMs: 112.4,
            offsetMs: 545.0,
            metadata: { endpoint: "https://api.exchangerate.host/latest", status: 200 },
          },
          { name: "Data Aggregation & Grouping", type: "compute", durationMs: 22.1, offsetMs: 657.8 },
        ],
      },
      {
        method: "POST",
        path: "/api/v1/orders/checkout",
        name: "POST /api/v1/orders/checkout",
        statusCode: 500,
        status: "error",
        spans: [
          { name: "HTTP POST /api/v1/orders/checkout", type: "http", durationMs: 215.6, offsetMs: 0, status: "error" },
          { name: "Middleware: authGuard", type: "middleware", durationMs: 2.1, offsetMs: 0.5 },
          {
            name: "DB: BEGIN TRANSACTION",
            type: "database",
            durationMs: 5.2,
            offsetMs: 3.1,
          },
          {
            name: "DB: SELECT stock FROM inventory WHERE item_id = 482 FOR UPDATE",
            type: "database",
            durationMs: 12.8,
            offsetMs: 9.0,
          },
          {
            name: "External: Payment Gateway Charge (Midtrans / Stripe)",
            type: "external",
            durationMs: 180.2,
            offsetMs: 22.4,
            status: "error",
            error: "PaymentTimeoutException: Gateway did not respond in 150ms",
            metadata: { gateway: "midtrans", retryCount: 2 },
          },
          {
            name: "DB: ROLLBACK TRANSACTION",
            type: "database",
            durationMs: 4.8,
            offsetMs: 208.5,
          },
        ],
      },
      {
        method: "GET",
        path: "/api/v1/users/me/profile",
        name: "GET /api/v1/users/me/profile",
        statusCode: 200,
        status: "success",
        spans: [
          { name: "HTTP GET /api/v1/users/me/profile", type: "http", durationMs: 18.5, offsetMs: 0 },
          { name: "Middleware: jwtVerify", type: "middleware", durationMs: 1.2, offsetMs: 0.2 },
          {
            name: "Cache: redis.get user:profile:usr_992 (HIT)",
            type: "cache",
            durationMs: 2.4,
            offsetMs: 1.6,
            metadata: { cacheStatus: "HIT" },
          },
          { name: "Format Profile DTO", type: "compute", durationMs: 12.8, offsetMs: 4.5 },
        ],
      },
      {
        method: "PUT",
        path: "/api/v1/settings/notifications",
        name: "PUT /api/v1/settings/notifications",
        statusCode: 200,
        status: "success",
        spans: [
          { name: "HTTP PUT /api/v1/settings/notifications", type: "http", durationMs: 35.8, offsetMs: 0 },
          { name: "Middleware: validateBody", type: "middleware", durationMs: 2.4, offsetMs: 0.3 },
          {
            name: "DB: UPDATE user_settings SET email_alert = true WHERE user_id = $1",
            type: "database",
            durationMs: 28.1,
            offsetMs: 3.2,
            metadata: { table: "user_settings", affectedRows: 1 },
          },
          { name: "Compute response payload", type: "compute", durationMs: 4.2, offsetMs: 31.4 },
        ],
      },
    ];

    const generated = [];
    for (let i = 0; i < count; i++) {
      const template = mockTemplates[i % mockTemplates.length];
      const traceId = `tr-demo-${crypto.randomUUID().slice(0, 6)}`;
      const rootSpan = template.spans[0];
      const durationMs = rootSpan ? rootSpan.durationMs : 25;

      const trace = {
        traceId,
        projectId: targetProjectId,
        service: targetProjectId,
        name: template.name,
        method: template.method,
        path: template.path,
        startTime: Date.now() - Math.floor(Math.random() * 60000),
        durationMs,
        status: template.status,
        statusCode: template.statusCode,
        spans: template.spans.map((s, sIdx) => ({
          ...s,
          spanId: `sp-${traceId}-${sIdx + 1}`,
          parentSpanId: sIdx === 0 ? null : `sp-${traceId}-1`,
        })),
      };

      generated.push(trace);
    }

    return this.ingest(generated, targetProjectId);
  }
}

export const tracesService = new TracesService();
