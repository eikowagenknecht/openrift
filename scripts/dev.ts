// Auto-picks free ports (from api 3000, web 5173) so `bun run dev` works in
// any worktree alongside main with no per-worktree config.
// oxlint-disable-next-line import/no-nodejs-modules -- dev orchestrator runs in Node/Bun
import { spawn } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- dev orchestrator runs in Node/Bun
import { createServer } from "node:net";

const API_DEFAULT_PORT = 3000;
const WEB_DEFAULT_PORT = 5173;
const PORT_SCAN_RANGE = 100;

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

// `bun run dev` sets DEV_HTTPS so vite serves TLS with a self-signed cert,
// giving the camera-based admin scan page a secure context on real phones.
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
      // Vite's browser proxy falls back to localhost:3000; without this,
      // direct-from-browser fetches hit another instance's api on a shifted port.
      VITE_API_PROXY_TARGET: `http://localhost:${apiPort}`,
    },
  }),
];

let shuttingDown = false;

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
