import { readFileSync } from "node:fs";

import { test as setup } from "@playwright/test";

import { setupAdminUser, setupRegularUser } from "./helpers/auth.js";
import type { E2eState } from "./helpers/constants.js";
import { STATE_FILE } from "./helpers/constants.js";
import { connectToDb } from "./helpers/db.js";

setup("create authenticated sessions", async ({ request }) => {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const sql = connectToDb(state.tempDbUrl);

  try {
    await setupRegularUser(request, sql);
    await setupAdminUser(request, sql);
  } finally {
    await sql.end();
  }
});
