import test from "node:test";
import assert from "node:assert/strict";
import {
  chatWithOllama,
  getOllamaStatus,
} from "../src/services/ollama.service.js";
import { buildProjectAiContext } from "../src/services/aiContext.service.js";

test("getOllamaStatus detects installed model", async () => {
  const status = await getOllamaStatus();
  assert.equal(status.provider, "ollama");
  assert.equal(status.model, "qwen2.5-coder:7b");
  assert.equal(status.available, true);
  assert.ok(status.models.includes("qwen2.5-coder:7b"));
});

test("chatWithOllama returns a reply", async () => {
  const data = await chatWithOllama({
    message: "Balas dengan satu kata saja: OK",
    contextText: "## Active project\n- name: demo-project\n- status: stopped",
  });
  assert.equal(typeof data.reply, "string");
  assert.ok(data.reply.trim().length > 0);
  assert.equal(data.stats.model.includes("qwen2.5-coder"), true);
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

  assert.match(ctx.contextText, /Active project/);
  assert.match(ctx.contextText, /Recent logs/);
  assert.match(ctx.contextText, /Git status/);
  assert.equal(ctx.project.id, "demo");
});
