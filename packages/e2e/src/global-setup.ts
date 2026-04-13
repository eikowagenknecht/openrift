import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FullConfig } from "@playwright/test";

import { API_BASE_URL, API_PORT, STATE_FILE, WEB_BASE_URL, WEB_PORT } from "./helpers/constants.js";
import { connectToDb, createTempDb, replaceDbName } from "./helpers/db.js";

const repoRoot = resolve(import.meta.dirname, "../../..");

/**
 * Wait for a URL to respond (any non-network-error status), polling every second.
 */
async function waitForServer(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      // Server not up yet
    }
    await new Promise((_resolve) => setTimeout(_resolve, 1000));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

/**
 * Playwright global setup:
 * 1. Create a temporary database with migrations and seed data
 * 2. Start the API server pointing at the temp DB
 * 3. Start the web dev server pointing at the API
 * 4. Wait for both servers to be healthy
 */
export default async function globalSetup(_config: FullConfig) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for E2E tests. Set it in .env or pass it directly.");
  }

  // ── 1. Create temporary database ────────────────────────────────────────

  console.log("[e2e] Creating temporary database...");
  const tempDbName = await createTempDb(databaseUrl, "e2e");
  const tempDbUrl = replaceDbName(databaseUrl, tempDbName);
  console.log(`[e2e]   → ${tempDbName}`);

  // Run migrations via the API's migration system
  console.log("[e2e] Running migrations...");
  const apiRoot = resolve(repoRoot, "apps/api/src");
  const { createDb } = await import(`${apiRoot}/db/connect.js`);
  const { migrate } = await import(`${apiRoot}/db/migrate.js`);

  const { db } = createDb(tempDbUrl);
  const noopLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => noopLogger,
  };
  await migrate(db, noopLogger);
  await db.destroy();

  // Load seed data
  console.log("[e2e] Loading seed data...");
  const seedPath = resolve(apiRoot, "test/fixtures/seed.sql");
  const seedSql = readFileSync(seedPath, "utf8");
  const sql = connectToDb(tempDbUrl);
  await sql.unsafe(seedSql);
  await sql.end();

  // ── 2. Start API server ─────────────────────────────────────────────────

  console.log("[e2e] Starting API server on port", API_PORT, "...");
  const apiProcess = spawn("bun", [resolve(apiRoot, "index.ts")], {
    cwd: repoRoot,
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: tempDbUrl,
      PORT: String(API_PORT),
      APP_ENV: "development",
      BETTER_AUTH_SECRET: "e2e-test-secret-not-real",
      BETTER_AUTH_URL: WEB_BASE_URL,
      CORS_ORIGIN: WEB_BASE_URL,
    },
  });

  apiProcess.stdout?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      console.log(`[api] ${line}`);
    }
  });
  apiProcess.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      console.error(`[api] ${line}`);
    }
  });

  await waitForServer(`${API_BASE_URL}/api/health`, 120_000);
  console.log("[e2e] API server is ready");

  // ── 3. Start web dev server ─────────────────────────────────────────────

  console.log("[e2e] Starting web dev server on port", WEB_PORT, "...");
  const webProcess = spawn("bun", ["run", "dev"], {
    cwd: resolve(repoRoot, "apps/web"),
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(WEB_PORT),
      API_INTERNAL_URL: API_BASE_URL,
      VITE_API_PROXY_TARGET: API_BASE_URL,
      SITE_URL: WEB_BASE_URL,
    },
  });

  webProcess.stdout?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      console.log(`[web] ${line}`);
    }
  });
  webProcess.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      console.error(`[web] ${line}`);
    }
  });

  await waitForServer(`${WEB_BASE_URL}`, 60_000);
  console.log("[e2e] Web server is ready");

  // ── 4. Persist state for teardown ───────────────────────────────────────

  const state = {
    tempDbName,
    tempDbUrl,
    databaseUrl,
    apiPid: apiProcess.pid,
    webPid: webProcess.pid,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state));

  console.log("[e2e] Global setup complete");
}
