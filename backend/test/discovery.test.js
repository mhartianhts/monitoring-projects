import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverProjects,
  scanAvailableFolders,
} from "../src/services/projectDiscovery.service.js";
import { autoDetectConfig } from "../src/services/autoDetect.service.js";
import { LogBuffer, stripAnsi } from "../src/process/logBuffer.js";

test("scanAvailableFolders reads folders and config", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lpm-"));
  const projectDir = path.join(root, "demo-app");
  fs.mkdirSync(projectDir);
  fs.writeFileSync(
    path.join(projectDir, "project.config.json"),
    JSON.stringify({
      name: "Demo App",
      type: "node",
      start: "npm run dev",
      port: 3000,
    }),
  );
  fs.mkdirSync(path.join(root, "empty-folder"));

  const folders = scanAvailableFolders(root);
  assert.equal(folders.length, 2);
  const demo = folders.find((p) => p.id === "demo-app");
  assert.ok(demo);
  assert.equal(demo.hasConfig, true);
  assert.equal(demo.configSource, "file");
  assert.equal(demo.name, "Demo App");
  assert.equal(demo.port, 3000);

  const bare = folders.find((p) => p.id === "empty-folder");
  assert.equal(bare.hasConfig, false);
  assert.equal(bare.configSource, null);
});

test("autoDetectConfig detects node package.json scripts.dev", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lpm-node-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "api-service",
      scripts: { dev: "node server.js" },
    }),
  );

  const config = autoDetectConfig(root, "api-service");
  assert.ok(config);
  assert.equal(config.type, "node");
  assert.equal(config.start, "npm run dev");
  assert.equal(config.name, "api-service");
});

test("autoDetectConfig detects vue/vite", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lpm-vue-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "web-ui",
      scripts: { dev: "vite" },
      devDependencies: { vue: "^3.0.0", vite: "^5.0.0" },
    }),
  );
  fs.writeFileSync(path.join(root, "vite.config.js"), "export default {}");

  const config = autoDetectConfig(root, "web-ui");
  assert.ok(config);
  assert.equal(config.type, "vue");
  assert.equal(config.port, 5173);
});

test("autoDetectConfig detects docker compose", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lpm-docker-"));
  fs.writeFileSync(path.join(root, "docker-compose.yml"), "services: {}");

  const config = autoDetectConfig(root, "wa-service");
  assert.ok(config);
  assert.equal(config.type, "docker");
  assert.equal(config.start, "docker compose up");
  assert.equal(config.stop, "docker compose down");
});

test("scanAvailableFolders uses auto-detect when config missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lpm-auto-"));
  const projectDir = path.join(root, "flask-app");
  fs.mkdirSync(projectDir);
  fs.writeFileSync(path.join(projectDir, "app.py"), "print('hi')");
  fs.writeFileSync(path.join(projectDir, "requirements.txt"), "flask\n");

  const folders = scanAvailableFolders(root);
  const app = folders.find((p) => p.id === "flask-app");
  assert.ok(app);
  assert.equal(app.hasConfig, true);
  assert.equal(app.configSource, "auto");
  assert.equal(app.type, "python");
  assert.match(app.start, /app\.py/);
});

test("LogBuffer ring trims old lines", () => {
  const buffer = new LogBuffer(3);
  buffer.append("p1", "a");
  buffer.append("p1", "b");
  buffer.append("p1", "c");
  buffer.append("p1", "d");
  const lines = buffer.get("p1");
  assert.deepEqual(
    lines.map((x) => x.line),
    ["b", "c", "d"],
  );
});

test("stripAnsi removes werkzeug/color codes", () => {
  const raw =
    "\u001b[31m\u001b[1mWARNING: This is a development server.\u001b[0m";
  assert.equal(stripAnsi(raw), "WARNING: This is a development server.");

  const buffer = new LogBuffer(10);
  buffer.append("flask", "\u001b[33mPress CTRL+C to quit\u001b[0m", "stderr");
  assert.equal(buffer.get("flask")[0].line, "Press CTRL+C to quit");
});

test("discoverProjects returns managed active projects", () => {
  const projects = discoverProjects();
  assert.ok(Array.isArray(projects));
  for (const p of projects) {
    assert.ok(p.id);
    assert.ok(p.name);
    assert.ok(p.path);
    assert.equal(p.configSource, "managed");
  }
});
