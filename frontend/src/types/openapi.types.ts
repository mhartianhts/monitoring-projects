export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export interface IApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  openApiPath: string;
  tag: string;
  summary: string;
  sourceFile: string;
  pathParams: string[];
  queryParams: { name: string; sample?: string; schema?: Record<string, any> }[];
  requestBodySchema?: Record<string, any> | null;
  responseSchema?: Record<string, any> | null;
  sampleStatusCode: number;
}

export interface IOpenApiSpecResponse {
  projectId: string;
  projectName: string;
  projectPort: number;
  serverUrl: string;
  endpointsCount: number;
  endpoints: IApiEndpoint[];
  openApiDoc: {
    openapi: string;
    info: {
      title: string;
      description: string;
      version: string;
    };
    servers: { url: string; description: string }[];
    tags: { name: string; description: string }[];
    paths: Record<string, any>;
    components?: Record<string, any>;
  };
}

export interface IApiProxyResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  durationMs: number;
  sizeBytes: number;
}
