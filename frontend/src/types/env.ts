export interface EnvFileInfo {
  name: string;
  size: number;
  mtime: string;
  isDefault: boolean;
  isExample: boolean;
  keyCount: number;
}

export interface EnvFilesResponse {
  projectId: string;
  projectName: string;
  projectPath: string;
  files: EnvFileInfo[];
  hasEnv: boolean;
  hasExample: boolean;
}

export interface EnvEntry {
  type: "kv" | "comment" | "blank" | "unknown";
  line: number;
  key?: string;
  value?: string;
  comment?: string;
  inlineComment?: string;
  isSecret?: boolean;
  isPlaceholder?: boolean;
  isQuoted?: "none" | "single" | "double";
  raw: string;
}

export interface EnvFileContentResponse {
  exists: boolean;
  name: string;
  raw: string;
  entries: EnvEntry[];
  kvMap: Record<string, {
    value: string;
    isSecret: boolean;
    isPlaceholder: boolean;
    inlineComment: string;
    isQuoted: string;
    line: number;
  }>;
  summary: {
    totalKeys: number;
    secretKeys: number;
    placeholderKeys: number;
  };
}

export interface EnvDiffItem {
  key: string;
  value?: string;
  exampleValue?: string;
  baseValue?: string;
  targetValue?: string;
  valuesMatch?: boolean;
  isSecret?: boolean;
  isPlaceholder?: boolean;
  comment?: string;
}

export interface EnvCompareResponse {
  baseFile: {
    name: string;
    exists: boolean;
    totalKeys: number;
  };
  targetFile: {
    name: string;
    exists: boolean;
    totalKeys: number;
  };
  missingKeys: EnvDiffItem[];
  extraKeys: EnvDiffItem[];
  placeholderKeys: EnvDiffItem[];
  matchedKeys: EnvDiffItem[];
  healthScore: number;
  isHealthy: boolean;
  summary: {
    totalMissing: number;
    totalExtra: number;
    totalPlaceholders: number;
    totalMatched: number;
  };
}
