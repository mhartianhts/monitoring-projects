import { buildCodeGraph } from "../services/codeGraph.service.js";
import { ok, fail } from "../utils/response.js";

export const getProjectCodeGraph = async (req, res) => {
  try {
    const { id } = req.params;
    const graph = buildCodeGraph(id);
    return ok(res, graph);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const getProjectGraphStats = async (req, res) => {
  try {
    const { id } = req.params;
    const graph = buildCodeGraph(id);
    return ok(res, graph.stats);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};
