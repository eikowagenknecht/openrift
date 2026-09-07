import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FullConfig } from "@playwright/test";
import { chromium } from "@playwright/test";

import { API_BASE_URL, API_PORT, STATE_FILE, WEB_BASE_URL, WEB_PORT } from "./helpers/constants.js";
import { connectToDb, createTempDb, replaceDbName } from "./helpers/db.js";

const repoRoot = resolve(import.meta.dirname, "../../..");

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

// "ok" means the database is reachable, migrated, and has seed data.
async function waitForApiHealthy(url: string, timeoutMs: number) {
  const start = Date.now();
  let lastStatus: string | undefined;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        lastStatus = body.status;
        if (body.status === "ok") {
          return;
        }
      }
    } catch {
      // Server not up yet
    }
    await new Promise((_resolve) => setTimeout(_resolve, 500));
  }
  throw new Error(
    `API at ${url} did not become healthy within ${timeoutMs}ms (last status: ${lastStatus ?? "unreachable"})`,
  );
}

export default async function globalSetup(_config: FullConfig) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for E2E tests. Set it in .env or pass it directly.");
  }

  console.log("[e2e] Creating temporary database...");
  const tempDbName = await createTempDb(databaseUrl, "e2e");
  const tempDbUrl = replaceDbName(databaseUrl, tempDbName);
  console.log(`[e2e]   → ${tempDbName}`);

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

  console.log("[e2e] Loading seed data...");
  const seedPath = resolve(apiRoot, "test/fixtures/seed.sql");
  const seedSql = readFileSync(seedPath, "utf-8");
  const sql = connectToDb(tempDbUrl);
  await sql.unsafe(seedSql);

  // Migrations create the materialized views before seed data loads, so they
  // start empty and need a refresh.
  console.log("[e2e] Refreshing materialized views...");
  await sql`REFRESH MATERIALIZED VIEW mv_card_aggregates`;
  // mv_latest_printing_prices is defined over mv_daily_printing_prices;
  // refreshing out of order would publish an empty result.
  await sql`REFRESH MATERIALIZED VIEW mv_daily_printing_prices`;
  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`;
  await sql.end();

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
      // auth.setup + login tests do several sign-in/sign-up calls in quick
      // succession, which would trip the prod 10/min limit.
      DISABLE_AUTH_RATE_LIMIT: "1",
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

  await waitForApiHealthy(`${API_BASE_URL}/api/health`, 120_000);
  console.log("[e2e] API server is ready");

  console.log("[e2e] Starting web dev server on port", WEB_PORT, "...");
  const webProcess = spawn("bun", ["run", "dev"], {
    cwd: resolve(repoRoot, "apps/web"),
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(WEB_PORT),
      API_INTERNAL_URL: API_BASE_URL,
      VITE_API_PROXY_TARGET: API_BASE_URL,
      VITE_DISABLE_DEVTOOLS: "1",
      SITE_URL: WEB_BASE_URL,
    },
  });

  // Vite's startup/restart errors span multiple lines; keeps the last 100 lines for diagnosis.
  const webOutputTail: string[] = [];
  const recordWeb = (data: Buffer, isError: boolean) => {
    for (const line of data.toString().split("\n")) {
      if (!line.trim()) {
        continue;
      }
      webOutputTail.push(line);
      if (webOutputTail.length > 100) {
        webOutputTail.shift();
      }
      if (isError) {
        console.error(`[web] ${line}`);
      } else {
        console.log(`[web] ${line}`);
      }
    }
  };
  webProcess.stdout?.on("data", (data: Buffer) => recordWeb(data, false));
  webProcess.stderr?.on("data", (data: Buffer) => recordWeb(data, true));

  // Teardown's SIGTERM can surface as signal "SIGTERM" or exit code 143
  // depending on the shell wrapper; treat both as a normal exit.
  webProcess.on("exit", (code, signal) => {
    if (code !== 0 && code !== 143 && signal !== "SIGTERM") {
      console.error(
        `[e2e] ⚠ Web dev server exited unexpectedly (code=${code}, signal=${signal}). Recent output:\n${webOutputTail.join("\n")}`,
      );
    }
  });

  await waitForServer(`${WEB_BASE_URL}`, 60_000);
  console.log("[e2e] Web server is ready");

  // A plain fetch only warms the SSR module graph; the first real test would
  // still pay Vite's client-bundle compile cost and miss timeouts.
  console.log("[e2e] Warming up landing page in browser...");
  const warmupStart = Date.now();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
    const page = await context.newPage();
    await page.goto(WEB_BASE_URL, { waitUntil: "networkidle", timeout: 120_000 });
    await page.locator('[data-fan-index="0"]').waitFor({ state: "attached", timeout: 30_000 });

    // Vite dev compiles each route on first request; without this, a test's
    // first hit to a route can interact before it finished hydrating.
    for (const route of ["/cards", "/cards/annie-fiery", "/promos", "/sets", "/help", "/login"]) {
      try {
        await page.goto(`${WEB_BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
      } catch {
        // Best-effort: the request itself triggers compilation even on timeout.
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(`[e2e]   → warmed in ${Date.now() - warmupStart}ms`);

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
