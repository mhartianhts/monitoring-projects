import {
  listEnvFiles,
  readEnvFile,
  saveEnvFile,
  createEnvFile,
  deleteEnvFile,
  compareEnvFiles,
  syncMissingKeys,
  generateExampleFromEnv,
  switchActiveProfile,
} from "../services/envManager.service.js";
import { ok, fail, badRequest } from "../utils/response.js";

export const getEnvFiles = async (req, res) => {
  try {
    const { id } = req.params;
    const data = listEnvFiles(id);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const getEnvFileContent = async (req, res) => {
  try {
    const { id } = req.params;
    const filename = req.query.name || ".env";
    const data = readEnvFile(id, filename);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const updateEnvFileContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { filename = ".env", content = "", createBackup = true } = req.body || {};
    const data = saveEnvFile(id, filename, content, { createBackup: Boolean(createBackup) });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const handleCreateEnvFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { filename, copyFrom } = req.body || {};
    if (!filename || !filename.trim()) {
      return badRequest(res, "Field filename wajib diisi");
    }
    const data = createEnvFile(id, filename, copyFrom);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const handleDeleteEnvFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { filename } = req.body || {};
    if (!filename || !filename.trim()) {
      return badRequest(res, "Field filename wajib diisi");
    }
    const data = deleteEnvFile(id, filename);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const handleCompareEnvFiles = async (req, res) => {
  try {
    const { id } = req.params;
    const { baseFilename = ".env.example", targetFilename = ".env" } = req.body || {};
    const data = compareEnvFiles(id, baseFilename, targetFilename);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const handleSyncMissingKeys = async (req, res) => {
  try {
    const { id } = req.params;
    const { targetFilename = ".env", baseFilename = ".env.example", keys = [] } = req.body || {};
    const data = syncMissingKeys(id, targetFilename, baseFilename, keys);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const handleGenerateExample = async (req, res) => {
  try {
    const { id } = req.params;
    const { sourceFilename = ".env", targetFilename = ".env.example" } = req.body || {};
    const data = generateExampleFromEnv(id, sourceFilename, targetFilename);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};

export const handleSwitchProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { sourceFilename } = req.body || {};
    if (!sourceFilename || !sourceFilename.trim()) {
      return badRequest(res, "Field sourceFilename wajib diisi");
    }
    const data = switchActiveProfile(id, sourceFilename);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, error.status || 500);
  }
};
