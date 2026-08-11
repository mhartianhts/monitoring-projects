import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendChatMessages,
  clearChatHistory,
  getChatHistory,
  saveChatHistory,
} from "../src/services/aiChatHistory.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chatFile = path.resolve(
  __dirname,
  "../data/ai-chats/__history_test_project__.json",
);

test("ai chat history save/get/append/clear per project", () => {
  clearChatHistory("__history_test_project__");

  const saved = saveChatHistory("__history_test_project__", [
    { role: "user", content: "halo", id: "u-1", ts: 1 },
    { role: "assistant", content: "hai", id: "a-1", ts: 2 },
  ]);
  assert.equal(saved.messages.length, 2);

  const loaded = getChatHistory("__history_test_project__");
  assert.equal(loaded.messages.length, 2);
  assert.equal(loaded.messages[0].content, "halo");

  const appended = appendChatMessages("__history_test_project__", [
    { role: "user", content: "lagi", id: "u-2", ts: 3 },
  ]);
  assert.equal(appended.messages.length, 3);

  clearChatHistory("__history_test_project__");
  assert.equal(getChatHistory("__history_test_project__").messages.length, 0);
  assert.equal(fs.existsSync(chatFile), false);
});
