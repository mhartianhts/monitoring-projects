/**
 * Drop-in Tracing SDK for Express Projects (e.g. backend-aira)
 * 
 * Usage in your Express App:
 * 
 *   import { createTracer } from "./path/to/expressTracer.js";
 * 
 *   const tracer = createTracer({
 *     serviceName: "backend-aira",
 *     collectorUrl: "http://localhost:7171/api/traces/collect",
 *     enabled: process.env.NODE_ENV !== "production" || true,
 *   });
 * 
 *   app.use(tracer.middleware);
 * 
 *   // In your Controller/Service:
 *   await tracer.span(req, "DB: Find User By Email", "database", async () => {
 *     return await User.findOne({ where: { email } });
 *   }, { table: "users" });
 */

import http from "node:http";
import https from "node:https";

export const createTracer = ({
  serviceName = "backend-service",
  collectorUrl = "http://localhost:7171/api/traces/collect",
  enabled = true,
  batchIntervalMs = 500,
  maxBatchSize = 20,
} = {}) => {
  const queue = [];
  let flushTimer = null;

  const flushQueue = async () => {
    if (queue.length === 0) return;
    const batch = queue.splice(0, maxBatchSize);

    try {
      const url = new URL(collectorUrl);
      const payload = JSON.stringify(batch);
      const isHttps = url.protocol === "https:";
      const client = isHttps ? https : http;

      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            "x-project-id": serviceName,
          },
          timeout: 2000,
        },
        () => {
          // Success (silent fire-and-forget)
        }
      );

      req.on("error", () => {
        // Silently drop trace if monitoring server is down, no crash on target app
      });

      req.write(payload);
      req.end();
    } catch {
      // Ignored non-blocking
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushQueue();
    }, batchIntervalMs);
  };

  const sendTrace = (trace) => {
    if (!enabled) return;
    queue.push(trace);
    if (queue.length >= maxBatchSize) {
      void flushQueue();
    } else {
      scheduleFlush();
    }
  };

  /**
   * Express Root Tracing Middleware
   */
  const middleware = (req, res, next) => {
    if (!enabled) return next();

    const startHr = process.hrtime();
    const startTime = Date.now();
    const traceId = req.headers["x-trace-id"] || `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const rootSpanId = `sp-${Math.random().toString(36).slice(2, 8)}`;

    // Attach trace context to request
    req.traceContext = {
      traceId,
      rootSpanId,
      startTime,
      startHr,
      spans: [],
    };

    // Forward trace ID in response headers
    res.setHeader("X-Trace-Id", traceId);

    // Intercept response finish
    res.on("finish", () => {
      const diffHr = process.hrtime(startHr);
      const durationMs = Number((diffHr[0] * 1000 + diffHr[1] / 1e6).toFixed(2));
      const statusCode = res.statusCode;
      const status = statusCode >= 400 ? "error" : "success";

      const rootSpan = {
        spanId: rootSpanId,
        parentSpanId: null,
        name: `HTTP ${req.method} ${req.baseUrl || ""}${req.path || req.url}`,
        service: serviceName,
        type: "http",
        durationMs,
        offsetMs: 0,
        status,
        metadata: {
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode,
          ip: req.ip || req.socket.remoteAddress,
        },
      };

      const allSpans = [rootSpan, ...req.traceContext.spans];

      const trace = {
        traceId,
        projectId: serviceName,
        service: serviceName,
        name: `${req.method} ${req.baseUrl || ""}${req.path || req.url}`,
        method: req.method,
        path: req.originalUrl || req.url,
        startTime,
        durationMs,
        status,
        statusCode,
        spans: allSpans,
      };

      sendTrace(trace);
    });

    next();
  };

  /**
   * Helper to measure a child operation (e.g. DB Query, Compute, External Call)
   */
  const span = async (req, name, type = "compute", fn, metadata = {}) => {
    if (!enabled || !req?.traceContext) {
      return await fn();
    }

    const startHr = process.hrtime(req.traceContext.startHr);
    const offsetMs = Number((startHr[0] * 1000 + startHr[1] / 1e6).toFixed(2));
    const spanStartHr = process.hrtime();
    const spanId = `sp-${Math.random().toString(36).slice(2, 8)}`;

    let status = "success";
    let errorMsg = null;

    try {
      return await fn();
    } catch (err) {
      status = "error";
      errorMsg = err.message || String(err);
      throw err;
    } finally {
      const diff = process.hrtime(spanStartHr);
      const durationMs = Number((diff[0] * 1000 + diff[1] / 1e6).toFixed(2));

      req.traceContext.spans.push({
        spanId,
        parentSpanId: req.traceContext.rootSpanId,
        name,
        service: serviceName,
        type, // 'database' | 'middleware' | 'compute' | 'cache' | 'external'
        durationMs,
        offsetMs,
        status,
        error: errorMsg,
        metadata,
      });
    }
  };

  return {
    middleware,
    span,
    sendTrace,
    flush: flushQueue,
  };
};
