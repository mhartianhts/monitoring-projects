import { test } from "node:test";
import assert from "node:assert/strict";
import { TerminalService } from "../src/services/terminal.service.js";

test("TerminalService resolution and session handling", () => {
  const terminalService = new TerminalService();

  const shell = terminalService.resolveShell("powershell");
  assert.ok(shell.bin.includes("powershell"), "Shell default adalah powershell");

  const cmdShell = terminalService.resolveShell("cmd");
  assert.ok(cmdShell.bin.includes("cmd"), "Shell cmd dikenali dengan benar");

  const cwd = terminalService.resolveCwd(null, null);
  assert.ok(typeof cwd === "string", "CWD ter-resolve ke string path");
  assert.ok(cwd.length > 0);

  // Test session state map
  assert.equal(terminalService.listSessions().length, 0);
  assert.equal(terminalService.getSessionInfo("non-existent"), null);
  assert.equal(terminalService.write("non-existent", "data"), false);
  assert.equal(terminalService.resize("non-existent", 80, 24), false);
  assert.equal(terminalService.killSession("non-existent"), false);
});
