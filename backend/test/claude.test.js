import test from "node:test";
import assert from "node:assert/strict";
import { createClaudeController } from "../src/controllers/claude.controller.js";
import {
  createClaudeSession,
  listClaudeSessions,
  getClaudeSession,
  appendClaudeMessage,
  deleteClaudeSession,
} from "../src/services/claudeSession.service.js";
import { getClaudeStatus } from "../src/services/claudeCli.service.js";

test("claudeController.chat validates empty message", async () => {
  const fakeProcessManager = {};
  const controller = createClaudeController(fakeProcessManager);

  let responseStatus = 200;
  let responseBody = null;

  const mockReq = {
    body: {
      message: "   ",
    },
  };

  const mockRes = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  await controller.chat(mockReq, mockRes);

  assert.equal(responseStatus, 400);
  assert.equal(responseBody.success, false);
  assert.equal(responseBody.error, "Pesan tidak boleh kosong");
});

test("claudeSession CRUD operations work correctly", async () => {
  const newSession = await createClaudeSession({
    title: "Test Session Claude",
    model: "sonnet",
    mode: "safe",
  });

  assert.ok(newSession.id);
  assert.equal(newSession.title, "Test Session Claude");
  assert.equal(newSession.model, "sonnet");
  assert.equal(newSession.mode, "safe");

  // Tambah pesan
  await appendClaudeMessage(
    newSession.id,
    { role: "user", content: "Halo Claude" },
    null,
  );
  await appendClaudeMessage(
    newSession.id,
    { role: "assistant", content: "Halo dari laptop!" },
    { durationMs: 1200, totalCostUsd: 0.005 },
  );

  const fetched = await getClaudeSession(newSession.id);
  assert.equal(fetched.messages.length, 2);
  assert.equal(fetched.totalCostUsd, 0.005);

  const list = await listClaudeSessions();
  const found = list.find((s) => s.id === newSession.id);
  assert.ok(found);
  assert.equal(found.totalCostUsd, 0.005);

  // Hapus session test
  const deleted = await deleteClaudeSession(newSession.id);
  assert.equal(deleted, true);

  const afterDelete = await getClaudeSession(newSession.id);
  assert.equal(afterDelete, null);
});

test("getClaudeStatus detects installed CLI and models", async () => {
  const status = await getClaudeStatus();
  assert.ok(typeof status.available === "boolean");
  assert.ok(Array.isArray(status.models));
  assert.ok(status.models.length >= 3);
});
