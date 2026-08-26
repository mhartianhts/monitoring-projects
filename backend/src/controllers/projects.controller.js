import {
  discoverProjects,
  findProject,
} from "../services/projectDiscovery.service.js";
import {
  scanAvailableFolders,
  readManagedStore,
  syncSelectedFolders,
  addCustomProject,
  updateManagedProject,
  removeManagedProject,
} from "../services/managedProjects.service.js";
import {
  sortProjectsByFavorite,
  toggleFavorite,
} from "../services/preferences.service.js";
import {
  checkoutBranch,
  createBranch,
  getGitStatus,
  gitAddAll,
  gitCommit,
  gitPull,
  gitPush,
  isGitRepo,
} from "../services/git.service.js";
import {
  openBrowser,
  openFolder,
  openInEditor,
  detectEditors,
} from "../utils/openSystem.js";
import { fail, ok } from "../utils/response.js";

const requireProject = (id) => {
  const project = findProject(id);
  if (!project) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }
  return project;
};

const requireGitRepo = (project) => {
  if (!isGitRepo(project.path)) {
    throw Object.assign(new Error("Folder ini bukan git repository"), {
      status: 400,
    });
  }
};

export const createProjectsController = (processManager) => {
  const list = async (_req, res) => {
    try {
      await processManager.reconcileAll();
      const projects = sortProjectsByFavorite(
        discoverProjects().map((project) =>
          processManager.enrichProject(project),
        ),
      );
      return ok(res, projects);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const getOne = async (req, res) => {
    try {
      const project = findProject(req.params.id);
      if (!project) return fail(res, "Project not found", 404);
      await processManager.reconcileProject(project);
      return ok(res, processManager.enrichProject(project));
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const start = async (req, res) => {
    try {
      const data = await processManager.start(req.params.id);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const stop = async (req, res) => {
    try {
      const data = await processManager.stop(req.params.id);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const restart = async (req, res) => {
    try {
      const data = await processManager.restart(req.params.id);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const startAll = async (_req, res) => {
    try {
      const data = await processManager.startAll();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const stopAll = async (_req, res) => {
    try {
      const data = await processManager.stopAll();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const restartAll = async (_req, res) => {
    try {
      const data = await processManager.restartAll();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const logs = (req, res) => {
    const project = findProject(req.params.id);
    if (!project) return fail(res, "Project not found", 404);
    const limit = Number(req.query.limit || 500);
    return ok(res, processManager.getLogs(req.params.id, limit));
  };

  const clearLogs = (req, res) => {
    const project = findProject(req.params.id);
    if (!project) return fail(res, "Project not found", 404);
    processManager.clearLogs(req.params.id);
    return ok(res, { cleared: true });
  };

  const openProjectFolder = (req, res) => {
    const project = findProject(req.params.id);
    if (!project) return fail(res, "Project not found", 404);
    openFolder(project.path);
    return ok(res, { opened: true, path: project.path });
  };

  const openProjectBrowser = (req, res) => {
    const project = findProject(req.params.id);
    if (!project) return fail(res, "Project not found", 404);
    const enriched = processManager.enrichProject(project);
    const url =
      (enriched.url && String(enriched.url).trim()) ||
      (enriched.port ? `http://localhost:${enriched.port}` : null);
    if (!url) return fail(res, "URL/port not configured", 400);
    openBrowser(url);
    return ok(res, { opened: true, url });
  };

  const openProjectEditor = async (req, res) => {
    try {
      const project = findProject(req.params.id);
      if (!project) return fail(res, "Project not found", 404);
      const editor = String(req.body?.editor || "").trim();
      if (!editor) return fail(res, "editor required", 400);
      const data = await openInEditor(editor, project.path);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const listEditors = async (_req, res) => {
    try {
      const force = String(_req.query.refresh || "") === "1";
      const editors = await detectEditors({ force });
      return ok(res, editors);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const favorite = (req, res) => {
    const project = findProject(req.params.id);
    if (!project) return fail(res, "Project not found", 404);
    toggleFavorite(req.params.id);
    return ok(res, processManager.enrichProject(project));
  };

  const gitStatus = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      const data = await getGitStatus(project.path);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const gitCreateBranch = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      requireGitRepo(project);
      const data = await createBranch(
        project.path,
        req.body?.name,
        req.body?.checkout !== false,
      );
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const gitCheckout = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      requireGitRepo(project);
      const data = await checkoutBranch(project.path, req.body?.name);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const gitAdd = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      requireGitRepo(project);
      const data = await gitAddAll(project.path);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const gitCommitAction = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      requireGitRepo(project);
      const data = await gitCommit(project.path, req.body?.message);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const gitPushAction = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      requireGitRepo(project);
      const data = await gitPush(project.path);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const gitPullAction = async (req, res) => {
    try {
      const project = requireProject(req.params.id);
      requireGitRepo(project);
      const data = await gitPull(project.path);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const getAvailableFolders = (_req, res) => {
    try {
      const folders = scanAvailableFolders(_req.query.root || undefined);
      return ok(res, folders);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const getManagedProjects = (_req, res) => {
    try {
      const data = readManagedStore();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const syncProjects = async (req, res) => {
    try {
      const folders = req.body?.folders;
      if (!Array.isArray(folders)) {
        return fail(res, "Field folders wajib berupa array", 400);
      }
      const data = syncSelectedFolders(folders);
      await processManager.reconcileAll();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const addCustom = async (req, res) => {
    try {
      const data = addCustomProject(req.body);
      await processManager.reconcileAll();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 400);
    }
  };

  const updateManaged = async (req, res) => {
    try {
      const data = updateManagedProject(req.params.id, req.body);
      await processManager.reconcileAll();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 400);
    }
  };

  const removeManaged = async (req, res) => {
    try {
      const data = removeManagedProject(req.params.id);
      await processManager.reconcileAll();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  return {
    list,
    getOne,
    start,
    stop,
    restart,
    startAll,
    stopAll,
    restartAll,
    logs,
    clearLogs,
    openProjectFolder,
    openProjectBrowser,
    openProjectEditor,
    listEditors,
    favorite,
    gitStatus,
    gitCreateBranch,
    gitCheckout,
    gitAdd,
    gitCommitAction,
    gitPushAction,
    gitPullAction,
    getAvailableFolders,
    getManagedProjects,
    syncProjects,
    addCustom,
    updateManaged,
    removeManaged,
  };
};
