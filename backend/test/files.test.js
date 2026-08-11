import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isPathInside,
  safeResolvePath,
  getProjectFileTree,
  readProjectFile,
  writeProjectFile,
  editProjectFile,
  searchProjectFiles,
} from "../src/services/files.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockProjectDir = path.resolve(__dirname, "mock_project");

test.before(() => {
  if (!fs.existsSync(mockProjectDir)) {
    fs.mkdirSync(mockProjectDir, { recursive: true });
  }
  fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "mock" }));
  fs.mkdirSync(path.join(mockProjectDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(mockProjectDir, "src", "index.js"), "console.log('hello world');");
});

test.after(() => {
  if (fs.existsSync(mockProjectDir)) {
    fs.rmSync(mockProjectDir, { recursive: true, force: true });
  }
});

test("isPathInside and safeResolvePath prevent directory traversal", () => {
  assert.equal(isPathInside(mockProjectDir, path.join(mockProjectDir, "src", "index.js")), true);
  assert.equal(isPathInside(mockProjectDir, path.resolve(mockProjectDir, "../outside.txt")), false);

  const resolved = safeResolvePath(mockProjectDir, "src/index.js");
  assert.equal(resolved, path.join(mockProjectDir, "src", "index.js"));

  assert.throws(() => {
    safeResolvePath(mockProjectDir, "../../outside.txt");
  }, /tidak diizinkan/i);
});

test("getProjectFileTree builds folder structure", async () => {
  const { tree } = await getProjectFileTree(mockProjectDir);
  assert.ok(Array.isArray(tree));
  const srcNode = tree.find((n) => n.name === "src");
  assert.ok(srcNode);
  assert.equal(srcNode.type, "directory");
  assert.equal(srcNode.children.length, 1);
  assert.equal(srcNode.children[0].name, "index.js");
});

test("readProjectFile, writeProjectFile, and editProjectFile operate on files", async () => {
  const read = await readProjectFile(mockProjectDir, "src/index.js");
  assert.equal(read.isBinary, false);
  assert.ok(read.content.includes("hello world"));

  const write = await writeProjectFile(mockProjectDir, "src/test.js", "const a = 1;");
  assert.equal(write.isNew, true);
  assert.equal(write.path, "src/test.js");

  const edit = await editProjectFile(
    mockProjectDir,
    "src/test.js",
    "const a = 1;",
    "const a = 2;"
  );
  assert.ok(edit.newContent.includes("const a = 2;"));
});

test("searchProjectFiles searches for matches in file contents and filenames", async () => {
  const results = await searchProjectFiles(mockProjectDir, "hello");
  assert.ok(results.length > 0);
  assert.equal(results[0].path, "src/index.js");
});
