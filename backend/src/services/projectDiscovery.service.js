import { appConfig } from "../config/app.js";
import {
  getActiveProjects,
  scanAvailableFolders,
} from "./managedProjects.service.js";

export const discoverProjects = (_root = appConfig.projectsRoot) => {
  const projects = getActiveProjects();
  return projects.sort((a, b) => a.name.localeCompare(b.name));
};

export const findProject = (id, _root = appConfig.projectsRoot) => {
  return discoverProjects().find((project) => project.id === id) || null;
};

export { scanAvailableFolders };
