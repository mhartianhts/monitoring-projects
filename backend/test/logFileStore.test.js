import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  appendProjectLog,
  buildRedirectedStartCommand,
  clearProjectLog,
  getProjectLogPath,
  LogFileTailer,
  readProjectLogTail,
  truncateProjectLog,
} from "../src/process/logFileStore.js";

const TEST_ID = `__logtest_${process.pid}__`;

test("log file truncate/append/readTail", () => {
  truncateProjectLog(TEST_ID);
  appendProjectLog(TEST_ID, "line-a");
  appendProjectLog(TEST_ID, "line-b");
  appendProjectLog(TEST_ID, "line-c");

  const all = readProjectLogTail(TEST_ID, 10);
  assert.deepEqual(all, ["line-a", "line-b", "line-c"]);

  const lastTwo = readProjectLogTail(TEST_ID, 2);
  assert.deepEqual(lastTwo, ["line-b", "line-c"]);

  clearProjectLog(TEST_ID);
  assert.deepEqual(readProjectLogTail(TEST_ID, 10), []);
});

test("buildRedirectedStartCommand includes log path", () => {
  const cmd = buildRedirectedStartCommand("npm start", "D:\\tmp\\app.log");
  assert.match(cmd, /npm start/);
  assert.match(cmd, />>/);
  assert.match(cmd, /2>&1/);
  assert.match(cmd, /app\.log/);
});

test("LogFileTailer emits new lines", async () => {
  truncateProjectLog(TEST_ID);
  const received = [];
  const tailer = new LogFileTailer(
    TEST_ID,
    (chunk) => {
      received.push(chunk);
    },
    { intervalMs: 50 },
  );
  tailer.start({ fromBeginning: false });

  appendProjectLog(TEST_ID, "hello-tail");
  await new Promise((r) => setTimeout(r, 200));
  tailer.stop();

  assert.ok(received.some((chunk) => chunk.includes("hello-tail")));
  clearProjectLog(TEST_ID);
  try {
    fs.unlinkSync(getProjectLogPath(TEST_ID));
  } catch {
    // ignore
  }
});
