import test from "node:test";
import assert from "node:assert/strict";
import { createAiController } from "../src/controllers/ai.controller.js";

test("aiController.chat validates empty message", async () => {
  const fakeProcessManager = {};
  const controller = createAiController(fakeProcessManager);

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

test("chatSession CRUD operations work correctly", async () => {
  const {
    createChatSession,
    listChatSessions,
    getChatSession,
    appendMessageToSession,
    deleteChatSession,
  } = await import("../src/services/chatSession.service.js");

  const newSession = await createChatSession({
    title: "Test Session Token",
    model: "deepseek-v4-flash",
  });

  assert.ok(newSession.id);
  assert.equal(newSession.title, "Test Session Token");

  // Tambah pesan dan token stats
  const updated = await appendMessageToSession(
    newSession.id,
    { role: "user", content: "Halo AI" },
    null,
  );
  await appendMessageToSession(
    newSession.id,
    { role: "assistant", content: "Halo, ada yang bisa dibantu?" },
    { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  );

  const fetched = await getChatSession(newSession.id);
  assert.equal(fetched.messages.length, 2);
  assert.equal(fetched.totalTokens, 30);

  const list = await listChatSessions();
  const found = list.find((s) => s.id === newSession.id);
  assert.ok(found);
  assert.equal(found.totalTokens, 30);

  // Hapus session test
  const deleted = await deleteChatSession(newSession.id);
  assert.equal(deleted, true);

  const afterDelete = await getChatSession(newSession.id);
  assert.equal(afterDelete, null);
});
