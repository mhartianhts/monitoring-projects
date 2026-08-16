import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "../services/api";
import type { IOpenApiSpecResponse, IApiEndpoint, IApiProxyResponse, HttpMethod } from "../types/openapi.types";

export const useOpenApiStore = defineStore("openapi", () => {
  const specData = ref<IOpenApiSpecResponse | null>(null);
  const selectedEndpointId = ref<string | null>(null);
  const loading = ref(false);
  const sending = ref(false);
  const error = ref<string | null>(null);

  // Filters
  const search = ref("");
  const selectedTag = ref<string>("all");
  const selectedMethod = ref<string>("all");

  // Request form state
  const reqMethod = ref<HttpMethod>("GET");
  const reqPath = ref<string>("");
  const reqHeaders = ref<string>('{\n  "Accept": "application/json"\n}');
  const reqQueryParams = ref<string>("{}");
  const reqBody = ref<string>("{}");

  // Response state
  const lastResponse = ref<IApiProxyResponse | null>(null);
  const executionError = ref<string | null>(null);

  const selectedEndpoint = computed<IApiEndpoint | null>(() => {
    if (!specData.value || !selectedEndpointId.value) return null;
    return specData.value.endpoints.find((e) => e.id === selectedEndpointId.value) || null;
  });

  const availableTags = computed(() => {
    if (!specData.value) return [];
    const tags = new Set(specData.value.endpoints.map((e) => e.tag));
    return Array.from(tags).sort();
  });

  const filteredEndpoints = computed(() => {
    if (!specData.value) return [];
    let list = [...specData.value.endpoints];

    if (selectedTag.value !== "all") {
      list = list.filter((e) => e.tag === selectedTag.value);
    }

    if (selectedMethod.value !== "all") {
      list = list.filter((e) => e.method === selectedMethod.value);
    }

    if (search.value.trim()) {
      const q = search.value.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.path.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.tag.toLowerCase().includes(q) ||
          e.method.toLowerCase().includes(q)
      );
    }

    return list;
  });

  const groupedEndpoints = computed(() => {
    const groups: Record<string, IApiEndpoint[]> = {};
    for (const ep of filteredEndpoints.value) {
      if (!groups[ep.tag]) groups[ep.tag] = [];
      groups[ep.tag].push(ep);
    }
    return groups;
  });

  const selectEndpoint = (ep: IApiEndpoint) => {
    selectedEndpointId.value = ep.id;
    reqMethod.value = ep.method;
    reqPath.value = ep.path;

    // Prefill query params
    const qObj: Record<string, string> = {};
    for (const q of ep.queryParams) {
      qObj[q.name] = q.sample || "";
    }
    reqQueryParams.value = Object.keys(qObj).length > 0 ? JSON.stringify(qObj, null, 2) : "{}";

    // Prefill body if POST/PUT
    if (["POST", "PUT", "PATCH"].includes(ep.method)) {
      if (ep.requestBodySchema?.example) {
        reqBody.value = JSON.stringify(ep.requestBodySchema.example, null, 2);
      } else {
        reqBody.value = '{\n  \n}';
      }
    } else {
      reqBody.value = "{}";
    }

    lastResponse.value = null;
    executionError.value = null;
  };

  const fetchSpec = async (projectId: string) => {
    if (!projectId) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await api.getOpenApiSpec(projectId);
      specData.value = data;
      if (data.endpoints.length > 0 && !selectedEndpointId.value) {
        selectEndpoint(data.endpoints[0]);
      }
    } catch (err: any) {
      error.value = err.message || "Gagal memuat OpenAPI spec";
    } finally {
      loading.value = false;
    }
  };

  const executeRequest = async (projectId: string) => {
    if (!projectId) return;
    sending.value = true;
    executionError.value = null;
    lastResponse.value = null;

    try {
      let parsedHeaders = {};
      let parsedQueryParams = {};
      let parsedBody: any = null;

      try {
        parsedHeaders = reqHeaders.value.trim() ? JSON.parse(reqHeaders.value) : {};
      } catch {
        throw new Error("Format Headers JSON tidak valid");
      }

      try {
        parsedQueryParams = reqQueryParams.value.trim() ? JSON.parse(reqQueryParams.value) : {};
      } catch {
        throw new Error("Format Query Params JSON tidak valid");
      }

      if (["POST", "PUT", "PATCH"].includes(reqMethod.value)) {
        try {
          parsedBody = reqBody.value.trim() ? JSON.parse(reqBody.value) : null;
        } catch {
          throw new Error("Format Request Body JSON tidak valid");
        }
      }

      const res = await api.sendApiRequest(projectId, {
        method: reqMethod.value,
        urlPath: reqPath.value,
        headers: parsedHeaders,
        queryParams: parsedQueryParams,
        body: parsedBody,
      });

      lastResponse.value = res;
    } catch (err: any) {
      executionError.value = err.message || "Gagal mengirim request ke server lokal";
    } finally {
      sending.value = false;
    }
  };

  return {
    specData,
    selectedEndpointId,
    selectedEndpoint,
    loading,
    sending,
    error,
    search,
    selectedTag,
    selectedMethod,
    reqMethod,
    reqPath,
    reqHeaders,
    reqQueryParams,
    reqBody,
    lastResponse,
    executionError,
    availableTags,
    filteredEndpoints,
    groupedEndpoints,
    selectEndpoint,
    fetchSpec,
    executeRequest,
  };
});
