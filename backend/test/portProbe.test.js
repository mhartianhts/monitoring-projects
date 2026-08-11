import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import {
  findPidByPort,
  isPortListening,
} from "../src/services/portProbe.service.js";

const listen = (port) =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });

test("isPortListening detects open and closed ports", async () => {
  const server = await listen(0);
  const { port } = server.address();

  assert.equal(await isPortListening(port), true);
  assert.equal(await isPortListening(65534), false);

  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isPortListening(port), false);
});

test("findPidByPort returns current process for listening server", async () => {
  const server = await listen(0);
  const { port } = server.address();

  const pid = await findPidByPort(port);
  assert.equal(pid, process.pid);

  await new Promise((resolve) => server.close(resolve));
});
