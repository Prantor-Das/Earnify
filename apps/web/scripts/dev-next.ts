import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

type NextDevLock = {
  pid?: number;
  appUrl?: string;
  port?: number;
};

function parsePort(value: string | undefined) {
  const port = Number(value ?? 3000);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000;
}

function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "::");
  });
}

async function findAvailablePort(startPort: number) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available port found from ${startPort} to ${startPort + 49}`);
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getActiveNextDevLock() {
  const lockPath = path.join(process.cwd(), ".next", "dev", "lock");

  try {
    const lock = JSON.parse(
      fs.readFileSync(lockPath, "utf8"),
    ) as NextDevLock;

    if (lock.pid && isProcessRunning(lock.pid)) {
      return lock;
    }
  } catch {
    return null;
  }

  return null;
}

const activeLock = getActiveNextDevLock();
if (activeLock) {
  const url =
    activeLock.appUrl ?? `http://localhost:${activeLock.port ?? 3000}`;
  console.log(`A Next dev server is already running at ${url}.`);
  console.log(`PID: ${activeLock.pid}`);
  process.exit(0);
}

const requestedPort = parsePort(process.env.WEB_PORT);
const port = await findAvailablePort(requestedPort);

if (port !== requestedPort) {
  console.log(
    `Port ${requestedPort} is already in use. Starting web dev server on ${port} instead.`,
  );
}

const child = spawn("pnpm", ["exec", "next", "dev", "--turbopack", "--port", String(port)], {
  env: { ...process.env, PORT: String(port), WEB_PORT: String(port) },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
