// scripts/dev.ts — orchestrates the dev servers, auto-picking free ports so
// `bun run dev` works in any worktree alongside main with no per-worktree config.
//
// It prefers the conventional defaults (api 3000, web 5173) and only shifts to
// the next free pair when those are busy. So the first instance up (typically
// main) keeps the stable ports, and each additional worktree gets its own pair.
// The web server is told where its api lives via API_INTERNAL_URL, so it never
// accidentally talks to another instance's api.
// oxlint-disable-next-line import/no-nodejs-modules -- dev orchestrator runs in Node/Bun
import { spawn } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- dev orchestrator runs in Node/Bun
import { createServer } from "node:net";

const API_DEFAULT_PORT = 3000;
const WEB_DEFAULT_PORT = 5173;
const PORT_SCAN_RANGE = 100;

/**
 * Check whether a TCP port is free on the loopback interface.
 * @returns true if nothing is listening on the port.
 */
function isPortFree(port: number): Promise<boolean> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping the net.Server callback API
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Find the first free port at or after the preferred one.
 * @returns the chosen free port.
 */
async function findFreePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + PORT_SCAN_RANGE; port++) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free port found near ${preferred}`);
}

const apiPort = await findFreePort(API_DEFAULT_PORT);
const webPort = await findFreePort(WEB_DEFAULT_PORT);

// DEV_HTTPS makes vite serve TLS with a self-signed cert (`bun run dev:https`),
// which the camera-based admin scan page needs on real phones. The api stays
// plain http; only the browser-facing origin needs the secure context.
const webScheme = process.env.DEV_HTTPS ? "https" : "http";
console.log(`\n  web → ${webScheme}://localhost:${webPort}\n  api → http://localhost:${apiPort}\n`);

const children = [
  spawn("bun", ["run", "dev:api"], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(apiPort) },
  }),
  spawn("bun", ["run", "dev:web"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(webPort),
      API_INTERNAL_URL: `http://localhost:${apiPort}`,
      // Vite's browser proxy for /api/v1, /api/auth, /api/health falls back to
      // localhost:3000 — without this, direct-from-browser fetches (e.g. the
      // landing summary) silently hit another instance's api when this one got
      // a shifted port.
      VITE_API_PROXY_TARGET: `http://localhost:${apiPort}`,
    },
  }),
];

let shuttingDown = false;

/** Tear down both child servers once, on signal or first child exit. */
function shutdown(): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const child of children) {
  child.on("exit", shutdown);
}
