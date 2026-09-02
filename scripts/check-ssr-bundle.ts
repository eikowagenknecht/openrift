/* oxlint-disable import/no-nodejs-modules -- standalone script */
/**
 * Boot the built SSR server the way the image runs it, and prove it renders.
 *
 * The web image ships `apps/web/.output` with no node_modules beside it (see
 * the web stage in the Dockerfile), so every dependency has to be either
 * bundled into the output or copied into `.output/server/node_modules` by
 * Nitro's tracer. One that falls between the two builds cleanly and only
 * fails at module load, so a green `bun run build` proves nothing about it.
 * That gap shipped a `require("@opentelemetry/context-async-hooks")` the
 * runtime could not resolve, and every SSR request 500d in production.
 *
 * Two things make the run faithful, and the check is worthless without either:
 *
 * The output is copied outside the repo first. Run in place, a missing
 * dependency resolves from the repo's own node_modules by walking up the
 * tree, which is exactly what the image does not have. The original bug
 * passes when checked in place.
 *
 * A stub API stands in for the real one. `__root.beforeLoad` catches its own
 * fetch failures and seeds empty defaults for session, feature flags and site
 * settings, so any fail-fast response lets the landing page render. Pointing
 * at a dead port instead would work on a machine that refuses the connection
 * and hang for 10s on one that blackholes it, which is the difference between
 * CI and a WSL2 dev box.
 *
 * Usage: bun scripts/check-ssr-bundle.ts
 */

import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BOOT_TIMEOUT_MS = 60_000;
const RENDER_TIMEOUT_MS = 30_000;

const outputDir = resolve(import.meta.dirname ?? ".", "../apps/web/.output");

if (!statSync(outputDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`No build output at ${outputDir}. Run \`bun run build\` first.`);
  process.exit(1);
}

const stageDir = mkdtempSync(join(tmpdir(), "openrift-ssr-"));
const copy = Bun.spawnSync(["cp", "-R", outputDir, join(stageDir, ".output")]);
if (copy.exitCode !== 0) {
  rmSync(stageDir, { recursive: true, force: true });
  console.error(`Could not stage the build output: ${copy.stderr.toString().trim()}`);
  process.exit(1);
}

const stubApi = Bun.serve({
  port: 0,
  fetch: () =>
    new Response('{"error":"stub api"}', {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
});

// Claim a port the OS says is free, then hand it to the server. Ports are not
// fixed because worktrees run this concurrently.
const probe = Bun.serve({ port: 0, fetch: () => new Response() });
const port = probe.port;
void probe.stop(true);

const server = Bun.spawn(["bun", "run", join(stageDir, ".output/server/index.mjs")], {
  cwd: stageDir,
  env: {
    ...process.env,
    PORT: String(port),
    API_INTERNAL_URL: `http://127.0.0.1:${stubApi.port}`,
  },
  stdout: "pipe",
  stderr: "pipe",
});

let serverOutput = "";
const decoder = new TextDecoder();
async function collect(stream: ReadableStream<Uint8Array>): Promise<void> {
  for await (const chunk of stream) {
    serverOutput += decoder.decode(chunk);
  }
}
void collect(server.stdout);
void collect(server.stderr);

function cleanup(): void {
  server.kill();
  void stubApi.stop(true);
  rmSync(stageDir, { recursive: true, force: true });
}

function fail(reason: string, body?: string): never {
  cleanup();
  console.error(`SSR bundle check failed: ${reason}\n`);
  console.error(serverOutput.trim() || "(the server produced no output)");
  if (body !== undefined) {
    console.error(`\nResponse body:\n${body.slice(0, 2000)}`);
  }
  console.error(
    "\nIf the server could not resolve a module, the bundle needs it inlined:" +
      "\nadd its scope to `environments.ssr.resolve.noExternal` in" +
      "\napps/web/vite.config.ts, which applies to the build only.",
  );
  process.exit(1);
}

let response: Response | undefined;
const deadline = Date.now() + BOOT_TIMEOUT_MS;
while (Date.now() < deadline) {
  if (server.exitCode !== null) {
    fail(`the server exited with code ${server.exitCode} before serving a request`);
  }
  try {
    response = await fetch(`http://127.0.0.1:${port}/`, {
      redirect: "manual",
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
    break;
  } catch {
    await Bun.sleep(250);
  }
}

if (!response) {
  fail(`the server served no response to GET / within ${BOOT_TIMEOUT_MS / 1000}s`);
}
const body = await response.text();
if (response.status !== 200) {
  fail(`GET / returned ${response.status}, expected 200`, body);
}
if (!body.includes("<html")) {
  fail(`GET / returned ${body.length} bytes with no <html> element`, body);
}

cleanup();
console.log(`SSR bundle OK (GET / rendered ${body.length} bytes).`);
