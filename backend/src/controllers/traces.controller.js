import { tracesService } from "../services/traces.service.js";
import { ok, fail, badRequest } from "../utils/response.js";

export const createTracesController = (io) => {
  if (io) {
    tracesService.setSocket(io);
  }

  const collect = async (req, res) => {
    try {
      const payload = req.body;
      if (!payload) {
        return badRequest(res, "Missing trace payload");
      }
      const projectId = req.headers["x-project-id"] || req.query.projectId || req.body?.projectId || "default";
      const ingested = tracesService.ingest(payload, projectId);
      return ok(res, { ingestedCount: ingested.length, traces: ingested });
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const list = async (req, res) => {
    try {
      const { projectId, search, status, minDuration, limit, offset } = req.query;
      const data = tracesService.list({
        projectId,
        search,
        status,
        minDuration,
        limit,
        offset,
      });
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const getById = async (req, res) => {
    try {
      const { traceId } = req.params;
      const trace = tracesService.getById(traceId);
      if (!trace) {
        return fail(res, "Trace not found", 404);
      }
      return ok(res, trace);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const getStats = async (req, res) => {
    try {
      const { projectId } = req.query;
      const stats = tracesService.getStats(projectId);
      return ok(res, stats);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const clear = async (req, res) => {
    try {
      const { projectId } = req.query;
      const result = tracesService.clear(projectId);
      return ok(res, result);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const generateMock = async (req, res) => {
    try {
      const count = parseInt(req.body?.count || 6, 10);
      const projectId = req.body?.projectId || "backend-aira";
      const generated = tracesService.generateMockTraffic(count, projectId);
      return ok(res, { count: generated.length, generated });
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  return {
    collect,
    list,
    getById,
    getStats,
    clear,
    generateMock,
  };
};
