import { fail, ok, badRequest } from "../utils/response.js";
import {
  requireProject,
  getProjectFileTree,
  readProjectFile,
  searchProjectFiles,
  writeProjectFile,
  editProjectFile,
} from "../services/files.service.js";
import { runProjectCommand } from "../services/projectExec.service.js";

export const createFilesController = () => {
  const getTree = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      const data = await getProjectFileTree(project.path);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const readFile = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      const filePath = String(req.query.path || "").trim();
      if (!filePath) {
        return badRequest(res, "Query parameter 'path' wajib diisi");
      }
      const data = await readProjectFile(project.path, filePath);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const searchFiles = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      const query = String(req.query.query || "").trim();
      if (!query) {
        return badRequest(res, "Query parameter 'query' wajib diisi");
      }
      const data = await searchProjectFiles(project.path, query);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const writeFile = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      const filePath = String(req.body?.path || "").trim();
      const content = req.body?.content;
      if (!filePath || typeof content !== "string") {
        return badRequest(res, "Field 'path' dan 'content' (string) wajib diisi");
      }
      const data = await writeProjectFile(project.path, filePath, content);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const editFile = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      const filePath = String(req.body?.path || "").trim();
      const targetContent = String(req.body?.targetContent || "");
      const replacementContent = String(req.body?.replacementContent || "");
      if (!filePath || !targetContent) {
        return badRequest(res, "Field 'path' dan 'targetContent' wajib diisi");
      }
      const data = await editProjectFile(
        project.path,
        filePath,
        targetContent,
        replacementContent
      );
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const execCommand = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      const command = String(req.body?.command || "").trim();
      if (!command) {
        return badRequest(res, "Field 'command' wajib diisi");
      }
      const data = await runProjectCommand(project.path, command);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  return {
    getTree,
    readFile,
    searchFiles,
    writeFile,
    editFile,
    execCommand,
  };
};
