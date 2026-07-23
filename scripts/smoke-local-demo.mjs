#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createHermeticDemoEnvironment } from "./hermetic-demo-env.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const detached = process.platform !== "win32";
const childEnvironment = createHermeticDemoEnvironment(process.env);

const delay = (milliseconds) =>
  new Promise((resolveDelay) => {
    const timer = setTimeout(resolveDelay, milliseconds);
    timer.unref?.();
  });

const reserveLoopbackPort = async () => {
  const reservation = createServer();
  await new Promise((resolveListen, rejectListen) => {
    reservation.once("error", rejectListen);
    reservation.listen(0, "127.0.0.1", resolveListen);
  });
  const address = reservation.address();
  if (!address || typeof address === "string") {
    reservation.close();
    throw new Error("Could not reserve a loopback port for the demo proof.");
  }
  await new Promise((resolveClose, rejectClose) =>
    reservation.close((error) => (error ? rejectClose(error) : resolveClose()))
  );
  return address.port;
};

const port = await reserveLoopbackPort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  packageManager,
  ["--filter", "@litemcp/server", "exec", "tsx", "src/index.ts"],
  {
    cwd: repositoryRoot,
    detached,
    env: {
      ...childEnvironment,
      API_ORIGIN: origin,
      HOST: "127.0.0.1",
      LITEMCP_DEMO_MODE: "true",
      PORT: String(port),
      WEB_ORIGIN: "http://127.0.0.1:4321",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let serverOutput = "";
let serverSpawnError;
let cleanupPromise;
const appendServerOutput = (chunk) => {
  serverOutput = `${serverOutput}${String(chunk)}`.slice(-16_000);
};
server.stdout.on("data", appendServerOutput);
server.stderr.on("data", appendServerOutput);
server.once("error", (error) => {
  serverSpawnError = error;
});
const serverClosed = new Promise((resolveClosed) =>
  server.once("close", resolveClosed)
);

const signalServer = (signal) => {
  if (server.exitCode !== null || server.signalCode !== null) return;
  try {
    if (detached && server.pid) process.kill(-server.pid, signal);
    else server.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
};

const cleanup = () => {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    signalServer("SIGTERM");
    await Promise.race([serverClosed, delay(5_000)]);
    if (server.exitCode === null && server.signalCode === null) {
      signalServer("SIGKILL");
      await serverClosed;
    }
  })();
  return cleanupPromise;
};

const waitUntilReady = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverSpawnError) throw serverSpawnError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error("The local demo server exited before becoming ready.");
    }
    try {
      const response = await fetch(`${origin}/ready`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // The listener may not be accepting connections yet.
    }
    await delay(100);
  }
  throw new Error("The local demo server did not become ready within 30 seconds.");
};

let interrupted = false;
const handleSignal = (signal) => {
  if (interrupted) return;
  interrupted = true;
  void cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
};
const sigintHandler = () => handleSignal("SIGINT");
const sigtermHandler = () => handleSignal("SIGTERM");
process.once("SIGINT", sigintHandler);
process.once("SIGTERM", sigtermHandler);

try {
  await waitUntilReady();
  const proof = spawn(
    packageManager,
    ["--filter", "@litemcp/example-local-composition", "exec", "tsx", "src/index.ts"],
    {
      cwd: repositoryRoot,
      env: { ...childEnvironment, LITEMCP_API_URL: origin },
      stdio: "inherit",
    }
  );
  const proofExit = await new Promise((resolveExit, rejectExit) => {
    proof.once("error", rejectExit);
    proof.once("close", (code, signal) => resolveExit({ code, signal }));
  });
  if (proofExit.code !== 0) {
    throw new Error(
      `The governed-endpoint proof failed (${proofExit.signal ?? proofExit.code}).`
    );
  }
} catch (error) {
  if (serverOutput) process.stderr.write(`Local demo server output:\n${serverOutput}`);
  throw error;
} finally {
  process.removeListener("SIGINT", sigintHandler);
  process.removeListener("SIGTERM", sigtermHandler);
  await cleanup();
}
