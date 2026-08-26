import test from "node:test";
import assert from "node:assert/strict";
import {
  getTokenPortalStatus,
  chatWithTokenPortal,
} from "../src/services/tokenportal.service.js";
import { buildProjectAiContext } from "../src/services/aiContext.service.js";
import { appConfig } from "../src/config/app.js";

test("getTokenPortalStatus returns provider information", async () => {
  const status = await getTokenPortalStatus();
  assert.equal(status.provider, "tokenportal");
  assert.equal(status.model, appConfig.tokenportalModel);
  assert.equal(typeof status.available, "boolean");
  assert.ok(typeof status.hint === "string" && status.hint.length > 0);
});

test("chatWithTokenPortal throws clear error when API key is missing", async () => {
  if (!appConfig.tokenportalApiKey) {
    await assert.rejects(
      async () => {
        await chatWithTokenPortal({
          message: "Halo",
          contextText: "Project demo",
        });
      },
      (err) => {
        assert.equal(err.status, 401);
        assert.ok(err.hint && err.hint.includes("TOKENPORTAL_API_KEY"));
        return true;
      },
    );
  }
});

test("buildProjectAiContext includes project metadata", async () => {
  const fakeProject = {
    id: "demo",
    name: "Demo",
    path: process.cwd(),
    type: "node",
    port: 3000,
    start: "npm run dev",
    stop: null,
    cwd: ".",
    hasConfig: true,
    configError: null,
    configSource: "file",
    favorite: false,
  };

  const processManager = {
    enrichProject: (project) => ({
      ...project,
      status: "stopped",
      pid: null,
      stats: { cpu: 0, memory: 0, uptime: 0 },
    }),
    getLogs: () => [
      { line: "Server started", stream: "stdout", ts: Date.now() },
    ],
  };

  const ctx = await buildProjectAiContext(fakeProject, processManager, {
    includeLogs: true,
    includeGit: true,
  });

  assert.equal(ctx.project.id, "demo");
  assert.ok(ctx.contextText.includes("## Active project"));
  assert.ok(ctx.contextText.includes("- name: Demo"));
  assert.ok(ctx.contextText.includes("## Recent logs"));
});
