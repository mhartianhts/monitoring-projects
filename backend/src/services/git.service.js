import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BRANCH_RE = /^[A-Za-z0-9._\-\/]+$/;

const runGit = async (cwd, args) => {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return {
      ok: true,
      stdout: (stdout || "").trim(),
      stderr: (stderr || "").trim(),
    };
  } catch (error) {
    const stdout = (error.stdout || "").toString().trim();
    const stderr = (error.stderr || "").toString().trim();
    const message = stderr || stdout || error.message || "Git command failed";
    const err = new Error(message);
    err.status = 400;
    err.stdout = stdout;
    err.stderr = stderr;
    throw err;
  }
};

export const assertSafeBranchName = (name) => {
  const branch = String(name || "").trim();
  if (!branch) {
    throw Object.assign(new Error("Branch name required"), { status: 400 });
  }
  if (branch.length > 120 || !BRANCH_RE.test(branch) || branch.includes("..")) {
    throw Object.assign(new Error("Invalid branch name"), { status: 400 });
  }
  return branch;
};

export const isGitRepo = (projectPath) => {
  return fs.existsSync(path.join(projectPath, ".git"));
};

export const getGitStatus = async (projectPath) => {
  if (!isGitRepo(projectPath)) {
    return {
      isRepo: false,
      branch: null,
      branches: [],
      dirty: false,
      ahead: 0,
      behind: 0,
      changedFiles: [],
      remote: null,
    };
  }

  const branchResult = await runGit(projectPath, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  const branch = branchResult.stdout || "HEAD";

  const branchesResult = await runGit(projectPath, [
    "branch",
    "--format=%(refname:short)",
  ]);
  const branches = branchesResult.stdout
    ? branchesResult.stdout.split(/\r?\n/).filter(Boolean)
    : [];

  const statusResult = await runGit(projectPath, [
    "status",
    "--porcelain",
    "-b",
  ]);
  const lines = statusResult.stdout
    ? statusResult.stdout.split(/\r?\n/).filter(Boolean)
    : [];
  const header = lines[0] || "";
  const changedFiles = lines.slice(1).map((line) => line.trim());

  let ahead = 0;
  let behind = 0;
  const aheadMatch = header.match(/ahead\s+(\d+)/i);
  const behindMatch = header.match(/behind\s+(\d+)/i);
  if (aheadMatch) ahead = Number(aheadMatch[1]);
  if (behindMatch) behind = Number(behindMatch[1]);

  let remote = null;
  try {
    const remoteResult = await runGit(projectPath, [
      "remote",
      "get-url",
      "origin",
    ]);
    remote = remoteResult.stdout || null;
  } catch {
    remote = null;
  }

  return {
    isRepo: true,
    branch,
    branches,
    dirty: changedFiles.length > 0,
    ahead,
    behind,
    changedFiles,
    remote,
  };
};

export const createBranch = async (
  projectPath,
  branchName,
  checkout = true,
) => {
  const branch = assertSafeBranchName(branchName);
  if (checkout) {
    await runGit(projectPath, ["checkout", "-b", branch]);
  } else {
    await runGit(projectPath, ["branch", branch]);
  }
  return getGitStatus(projectPath);
};

export const checkoutBranch = async (projectPath, branchName) => {
  const branch = assertSafeBranchName(branchName);
  await runGit(projectPath, ["checkout", branch]);
  return getGitStatus(projectPath);
};

export const gitAddAll = async (projectPath) => {
  await runGit(projectPath, ["add", "-A"]);
  return getGitStatus(projectPath);
};

export const gitCommit = async (projectPath, message) => {
  const msg = String(message || "").trim();
  if (!msg) {
    throw Object.assign(new Error("Commit message required"), { status: 400 });
  }
  await runGit(projectPath, ["commit", "-m", msg]);
  return getGitStatus(projectPath);
};

export const gitPush = async (projectPath) => {
  const status = await getGitStatus(projectPath);
  if (!status.branch || status.branch === "HEAD") {
    throw Object.assign(new Error("Detached HEAD — pilih branch dulu"), {
      status: 400,
    });
  }
  // Push current branch; set upstream if needed
  try {
    await runGit(projectPath, ["push"]);
  } catch (error) {
    // Retry with -u origin <branch> when no upstream
    if (/no upstream|has no upstream|set-upstream/i.test(error.message)) {
      await runGit(projectPath, ["push", "-u", "origin", status.branch]);
    } else {
      throw error;
    }
  }
  return getGitStatus(projectPath);
};

export const gitPull = async (projectPath) => {
  const status = await getGitStatus(projectPath);
  if (!status.branch || status.branch === "HEAD") {
    throw Object.assign(new Error("Detached HEAD — pilih branch dulu"), {
      status: 400,
    });
  }
  if (!status.remote) {
    throw Object.assign(new Error("Remote origin belum dikonfigurasi"), {
      status: 400,
    });
  }
  await runGit(projectPath, ["pull", "--ff-only"]);
  return getGitStatus(projectPath);
};

const truncateText = (text, maxChars) => {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
};

/** Ringkasan diff lokal (staged + unstaged) untuk konteks AI. */
export const getGitDiffSummary = async (
  projectPath,
  { maxChars = 12000 } = {},
) => {
  if (!isGitRepo(projectPath)) {
    return { available: false, stat: "", diff: "" };
  }

  const safeGit = async (args) => {
    try {
      return await runGit(projectPath, args);
    } catch {
      return { ok: false, stdout: "", stderr: "" };
    }
  };

  const [statResult, unstagedResult, stagedResult, untrackedResult] =
    await Promise.all([
      safeGit(["diff", "--stat", "HEAD"]),
      safeGit(["diff", "HEAD"]),
      safeGit(["diff", "--cached"]),
      safeGit(["ls-files", "--others", "--exclude-standard"]),
    ]);

  const parts = [];
  if (stagedResult.stdout) {
    parts.push("### Staged diff\n" + stagedResult.stdout);
  }
  if (unstagedResult.stdout) {
    parts.push("### Unstaged / working tree diff\n" + unstagedResult.stdout);
  }
  if (untrackedResult.stdout) {
    parts.push(
      "### Untracked files\n" +
        untrackedResult.stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .map((f) => `- ${f}`)
          .join("\n"),
    );
  }

  return {
    available: true,
    stat: truncateText(statResult.stdout || "", 2000),
    diff: truncateText(parts.join("\n\n"), maxChars),
  };
};

/**
 * Ambil komparasi diff komprehensif untuk dokumentasi branch AI.
 */
export const getBranchDiffForDocs = async (
  projectPath,
  { maxChars = 20000 } = {},
) => {
  const status = await getGitStatus(projectPath);
  if (!status.isRepo) {
    throw Object.assign(new Error("Bukan git repository"), { status: 400 });
  }

  const safeGit = async (args) => {
    try {
      return await runGit(projectPath, args);
    } catch {
      return { ok: false, stdout: "", stderr: "" };
    }
  };

  const branch = status.branch || "HEAD";
  const branches = status.branches || [];

  let baseBranch = null;
  if (branch !== "main" && branches.includes("main")) {
    baseBranch = "main";
  } else if (branch !== "master" && branches.includes("master")) {
    baseBranch = "master";
  }

  const parts = [];
  parts.push(`Current Branch: ${branch}`);
  if (baseBranch) {
    parts.push(`Comparing against base branch: ${baseBranch}`);
  }

  if (baseBranch) {
    const logRes = await safeGit([
      "log",
      `${baseBranch}..${branch}`,
      "--oneline",
      "-n",
      "30",
    ]);
    if (logRes.stdout) {
      parts.push("### Branch Commits:\n" + logRes.stdout);
    }

    const branchStat = await safeGit([
      "diff",
      "--stat",
      `${baseBranch}...${branch}`,
    ]);
    if (branchStat.stdout) {
      parts.push(
        "### Branch Stat vs " + baseBranch + ":\n" + branchStat.stdout,
      );
    }

    const branchDiff = await safeGit(["diff", `${baseBranch}...${branch}`]);
    if (branchDiff.stdout) {
      parts.push(
        "### Branch Diff vs " + baseBranch + ":\n" + branchDiff.stdout,
      );
    }
  }

  const localStat = await safeGit(["diff", "--stat", "HEAD"]);
  if (localStat.stdout) {
    parts.push("### Local Uncommitted Stat:\n" + localStat.stdout);
  }

  const localDiff = await safeGit(["diff", "HEAD"]);
  if (localDiff.stdout) {
    parts.push("### Local Uncommitted Diff:\n" + localDiff.stdout);
  }

  const untracked = await safeGit([
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  if (untracked.stdout) {
    parts.push(
      "### Untracked Files:\n" +
        untracked.stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .map((f) => `- ${f}`)
          .join("\n"),
    );
  }

  const fullContent = parts.join("\n\n");

  return {
    branch,
    baseBranch,
    changedFiles: status.changedFiles,
    summary: truncateText(fullContent, maxChars),
  };
};

