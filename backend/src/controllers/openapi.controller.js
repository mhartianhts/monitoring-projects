import { buildOpenApiSpec, executeProxyRequest } from "../services/openapi.service.js";
import { ok, fail, badRequest } from "../utils/response.js";

export const getOpenApiSpec = async (req, res) => {
  try {
    const { id } = req.params;
    const data = buildOpenApiSpec(id);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const executeApiRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { method, urlPath, headers, queryParams, body } = req.body || {};

    if (!urlPath) {
      return badRequest(res, "Field urlPath wajib diisi");
    }

    const response = await executeProxyRequest({
      projectId: id,
      method: method || "GET",
      urlPath,
      headers: headers || {},
      queryParams: queryParams || {},
      body,
    });

    return ok(res, response);
  } catch (error) {
    return fail(res, error.message, 500);
  }
};
