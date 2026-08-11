import test from "node:test";
import assert from "node:assert/strict";
import {
  isPidAlive,
  readRuntimeStore,
  removeRuntimeEntry,
  saveRuntimeEntry,
} from "../src/services/runtimeStore.service.js";

test("runtimeStore save/remove/isPidAlive", () => {
  assert.equal(isPidAlive(process.pid), true);
  assert.equal(isPidAlive(99999999), false);
  assert.equal(isPidAlive(null), false);

  const id = `__test_${process.pid}__`;
  saveRuntimeEntry(id, {
    pid: process.pid,
    startedAt: Date.now(),
    start: "npm run dev",
    type: "node",
    path: "D:\\tmp",
  });

  const store = readRuntimeStore();
  assert.ok(store.processes[id]);
  assert.equal(store.processes[id].pid, process.pid);

  removeRuntimeEntry(id);
  assert.equal(readRuntimeStore().processes[id], undefined);
});
