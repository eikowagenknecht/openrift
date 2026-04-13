import { readFileSync, rmSync } from "node:fs";

import type { FullConfig } from "@playwright/test";

import { STATE_FILE } from "./helpers/constants.js";
import { dropTempDb } from "./helpers/db.js";

interface E2eState {
  tempDbName: string;
  tempDbUrl: string;
  databaseUrl: string;
  apiPid?: number;
  webPid?: number;
}

/**
 * Playwright global teardown:
 * 1. Kill the API and web server processes
 * 2. Drop the temporary database
 */
export default async function globalTeardown(_config: FullConfig) {
  let state: E2eState;
  try {
    state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.warn("[e2e] No state file found, skipping cleanup");
    return;
  }

  // Kill server processes
  if (state.apiPid) {
    try {
      process.kill(state.apiPid, "SIGTERM");
      console.log(`[e2e] Stopped API server (pid ${state.apiPid})`);
    } catch {
      // Process may have already exited
    }
  }

  if (state.webPid) {
    try {
      process.kill(state.webPid, "SIGTERM");
      console.log(`[e2e] Stopped web server (pid ${state.webPid})`);
    } catch {
      // Process may have already exited
    }
  }

  // Drop temporary database
  console.log(`[e2e] Dropping ${state.tempDbName}...`);
  await dropTempDb(state.databaseUrl, state.tempDbName);

  rmSync(STATE_FILE, { force: true });
  console.log("[e2e] Global teardown complete");
}
