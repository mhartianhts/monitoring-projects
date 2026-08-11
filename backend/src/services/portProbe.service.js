import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Cek apakah ada proses yang listen di port (localhost).
 * Cepat & cross-platform — tidak butuh netstat.
 */
export const isPortListening = (port, host = "127.0.0.1") => {
  const portNum = Number(port);
  if (!Number.isFinite(portNum) || portNum <= 0) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const socket = net.connect({ port: portNum, host });
    let settled = false;

    const done = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(400, () => done(false));
  });
};

const parseWindowsNetstatPid = (stdout, port) => {
  const portNum = Number(port);
  const lines = String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    // TCP    0.0.0.0:5075    0.0.0.0:0    LISTENING    14396
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.split(/\s+/);
    const local = parts[1] || "";
    const localPort = local.match(/:(\d+)$/);
    if (!localPort || Number(localPort[1]) !== portNum) continue;
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0) return pid;
  }
  return null;
};

const parseUnixSsPid = (stdout) => {
  // users:(("node",pid=1234,fd=23))
  const match = String(stdout).match(/pid=(\d+)/);
  if (!match) return null;
  const pid = Number(match[1]);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
};

const parseUnixLsofPid = (stdout) => {
  const line = String(stdout).trim().split(/\r?\n/)[0];
  const pid = Number(line);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
};

/**
 * Cari PID yang listen di port. Return null jika tidak ketemu.
 */
export const findPidByPort = async (port) => {
  const portNum = Number(port);
  if (!Number.isFinite(portNum) || portNum <= 0) return null;

  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"], {
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
      return parseWindowsNetstatPid(stdout, portNum);
    }

    try {
      const { stdout } = await execFileAsync(
        "ss",
        ["-ltnp", `sport = :${portNum}`],
        { maxBuffer: 1024 * 1024 },
      );
      const fromSs = parseUnixSsPid(stdout);
      if (fromSs) return fromSs;
    } catch {
      // fallback lsof
    }

    const { stdout } = await execFileAsync(
      "lsof",
      ["-nP", `-iTCP:${portNum}`, "-sTCP:LISTEN", "-t"],
      { maxBuffer: 1024 * 1024 },
    );
    return parseUnixLsofPid(stdout);
  } catch {
    return null;
  }
};
