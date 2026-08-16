import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { findProject } from "./projectDiscovery.service.js";
import { tracesService } from "./traces.service.js";

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".agents",
  ".claude",
  ".github",
  "dist",
  "build",
  ".cache",
  "coverage",
  "tmp",
  "logs",
]);

// Infer JSON Schema type from JavaScript value
const inferSchema = (val) => {
  if (val === null) return { type: "string", nullable: true };
  if (typeof val === "boolean") return { type: "boolean" };
  if (typeof val === "number") {
    return Number.isInteger(val) ? { type: "integer" } : { type: "number" };
  }
  if (typeof val === "string") {
    if (val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return { type: "string", format: "date-time" };
    }
    if (val.includes("@") && val.includes(".")) {
      return { type: "string", format: "email" };
    }
    return { type: "string" };
  }
  if (Array.isArray(val)) {
    const itemSchema = val.length > 0 ? inferSchema(val[0]) : { type: "string" };
    return { type: "array", items: itemSchema };
  }
  if (typeof val === "object") {
    const properties = {};
    for (const [k, v] of Object.entries(val)) {
      properties[k] = inferSchema(v);
    }
    return { type: "object", properties };
  }
  return { type: "string" };
};

// Regex patterns to find Express route declarations
// e.g. router.get("/users/:id", ...), app.post("/api/v1/auth/login", ...)
const ROUTE_METHOD_REGEX =
  /(?:router|app)\s*\.\s*(get|post|put|patch|delete|options|head)\s*\(\s*['"]([^'"]+)['"]/gi;

// Scan directory for route files
const scanRouteFiles = (dir, rootDir, collected = []) => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanRouteFiles(fullPath, rootDir, collected);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".js", ".ts", ".mjs", ".cjs"].includes(ext)) {
          const norm = fullPath.replace(/\\/g, "/").toLowerCase();
          if (norm.includes("route") || norm.includes("controller") || norm.includes("api") || norm.includes("server") || norm.includes("app")) {
            collected.push({
              fullPath,
              relPath: path.relative(rootDir, fullPath).replace(/\\/g, "/"),
            });
          }
        }
      }
    }
  } catch {}
  return collected;
};

// Extract tag / resource name from path
const extractTag = (routePath) => {
  const parts = routePath.split("/").filter((p) => p && !p.startsWith(":") && p !== "api" && !p.match(/^v\d+$/i));
  if (parts.length > 0) {
    const tag = parts[0];
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  }
  return "General";
};

/**
 * Build OpenAPI 3.0 Document for a Project
 */
export const buildOpenApiSpec = (projectId) => {
  const project = findProject(projectId);
  if (!project) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }

  const rootDir = project.path || project.dir || project.cwdPath;
  const routeFiles = scanRouteFiles(rootDir, rootDir);

  const endpointsMap = new Map();

  // 1. Static AST parsing of route files
  for (const file of routeFiles) {
    try {
      const content = fs.readFileSync(file.fullPath, "utf-8");
      let match;
      ROUTE_METHOD_REGEX.lastIndex = 0;
      while ((match = ROUTE_METHOD_REGEX.exec(content)) !== null) {
        const method = match[1].toLowerCase();
        let routePath = match[2];

        if (!routePath.startsWith("/")) routePath = "/" + routePath;

        // Prefix with base path if detected from filename
        const tag = extractTag(routePath);
        const endpointKey = `${method.toUpperCase()} ${routePath}`;

        if (!endpointsMap.has(endpointKey)) {
          // Extract path parameters e.g. :id -> {id}
          const pathParams = [];
          const openApiPath = routePath.replace(/:([a-zA-Z0-9_]+)/g, (_m, paramName) => {
            pathParams.push(paramName);
            return `{${paramName}}`;
          });

          endpointsMap.set(endpointKey, {
            id: `${method}_${routePath.replace(/[^a-zA-Z0-9]/g, "_")}`,
            method: method.toUpperCase(),
            path: routePath,
            openApiPath,
            tag,
            summary: `${method.toUpperCase()} ${routePath}`,
            sourceFile: file.relPath,
            pathParams,
            queryParams: [],
            requestBodySchema: null,
            responseSchema: null,
            sampleStatusCode: 200,
          });
        }
      }
    } catch {}
  }

  // 2. Enrich schemas from live request traces if available
  const projectTraces = tracesService.list({ projectId, limit: 200 }).items;
  for (const trace of projectTraces) {
    const rawPath = trace.path.split("?")[0];
    const method = trace.method.toUpperCase();
    const endpointKey = `${method} ${rawPath}`;

    let endpoint = endpointsMap.get(endpointKey);
    if (!endpoint) {
      const tag = extractTag(rawPath);
      endpoint = {
        id: `${method.toLowerCase()}_${rawPath.replace(/[^a-zA-Z0-9]/g, "_")}`,
        method,
        path: rawPath,
        openApiPath: rawPath.replace(/:([a-zA-Z0-9_]+)/g, "{$1}"),
        tag,
        summary: trace.name || `${method} ${rawPath}`,
        sourceFile: "runtime",
        pathParams: [],
        queryParams: [],
        requestBodySchema: null,
        responseSchema: null,
        sampleStatusCode: trace.statusCode || 200,
      };
      endpointsMap.set(endpointKey, endpoint);
    }

    // Extract query params from trace path
    if (trace.path.includes("?")) {
      const qs = trace.path.split("?")[1];
      const params = new URLSearchParams(qs);
      for (const [k, v] of params.entries()) {
        if (!endpoint.queryParams.some((q) => q.name === k)) {
          endpoint.queryParams.push({
            name: k,
            sample: v,
            schema: { type: "string" },
          });
        }
      }
    }

    // Infer schemas from root span metadata if available
    const rootSpan = trace.spans?.[0];
    if (rootSpan?.metadata?.body && !endpoint.requestBodySchema) {
      endpoint.requestBodySchema = inferSchema(rootSpan.metadata.body);
    }
  }

  const endpoints = Array.from(endpointsMap.values());

  // 3. Assemble OpenAPI 3.0 JSON Specification
  const paths = {};
  const tagsSet = new Set();

  for (const ep of endpoints) {
    tagsSet.add(ep.tag);
    if (!paths[ep.openApiPath]) {
      paths[ep.openApiPath] = {};
    }

    const parameters = [];
    for (const p of ep.pathParams) {
      parameters.push({
        name: p,
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
    for (const q of ep.queryParams) {
      parameters.push({
        name: q.name,
        in: "query",
        required: false,
        schema: q.schema,
      });
    }

    const operation = {
      tags: [ep.tag],
      summary: ep.summary,
      operationId: ep.id,
      parameters,
      responses: {
        [ep.sampleStatusCode || 200]: {
          description: "Successful response",
          content: {
            "application/json": {
              schema: ep.responseSchema || {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { type: "object" },
                },
              },
            },
          },
        },
      },
    };

    if (["POST", "PUT", "PATCH"].includes(ep.method)) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: ep.requestBodySchema || {
              type: "object",
              example: { name: "Sample Name", email: "sample@example.com" },
            },
          },
        },
      };
    }

    paths[ep.openApiPath][ep.method.toLowerCase()] = operation;
  }

  const targetPort = project.port || 3000;

  const openApiDoc = {
    openapi: "3.0.3",
    info: {
      title: `${project.name} API Specification`,
      description: `Auto-generated OpenAPI 3.0 specification from static route scanning & live traffic for ${project.name}.`,
      version: "1.0.0",
    },
    servers: [
      {
        url: project.url || `http://localhost:${targetPort}`,
        description: "Local Development Server",
      },
    ],
    tags: Array.from(tagsSet).map((t) => ({ name: t, description: `${t} resource endpoints` })),
    paths,
    components: {
      schemas: {},
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  };

  return {
    projectId,
    projectName: project.name,
    projectPort: targetPort,
    serverUrl: project.url || `http://localhost:${targetPort}`,
    endpointsCount: endpoints.length,
    endpoints,
    openApiDoc,
  };
};

/**
 * Execute HTTP Request to target project (Proxy Runner)
 */
export const executeProxyRequest = async ({
  projectId,
  method = "GET",
  urlPath,
  headers = {},
  queryParams = {},
  body = null,
}) => {
  const project = findProject(projectId);
  if (!project) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }

  const port = project.port || 3000;
  const baseUrl = project.url || `http://localhost:${port}`;

  // Build target URL
  let targetUrl = `${baseUrl}${urlPath.startsWith("/") ? urlPath : "/" + urlPath}`;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams || {})) {
    if (v !== undefined && v !== null && v !== "") {
      qs.set(k, String(v));
    }
  }
  if (qs.toString()) {
    targetUrl += `?${qs.toString()}`;
  }

  const parsedUrl = new URL(targetUrl);
  const isHttps = parsedUrl.protocol === "https:";
  const client = isHttps ? https : http;

  const payload = body && typeof body === "object" ? JSON.stringify(body) : body;

  const reqHeaders = {
    Accept: "application/json, text/plain, */*",
    ...headers,
  };

  if (payload) {
    reqHeaders["Content-Type"] = reqHeaders["Content-Type"] || "application/json";
    reqHeaders["Content-Length"] = Buffer.byteLength(payload);
  }

  const startHr = process.hrtime();

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: method.toUpperCase(),
        headers: reqHeaders,
        timeout: 10000,
      },
      (res) => {
        let rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          const diffHr = process.hrtime(startHr);
          const durationMs = Number((diffHr[0] * 1000 + diffHr[1] / 1e6).toFixed(2));

          let parsedBody = rawData;
          try {
            parsedBody = JSON.parse(rawData);
          } catch {}

          resolve({
            statusCode: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            data: parsedBody,
            durationMs,
            sizeBytes: Buffer.byteLength(rawData),
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timeout ke ${targetUrl} (tidak ada respons dalam 10 detik)`));
    });

    req.on("error", (err) => {
      reject(new Error(`Gagal menghubungi server lokal di ${baseUrl} (${err.message}). Pastikan project sedang berjalan!`));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
};
