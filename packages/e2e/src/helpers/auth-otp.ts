import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { E2eState } from "./constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "./constants.js";
import { connectToDb } from "./db.js";

export type Sql = ReturnType<typeof connectToDb>;

export function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  return connectToDb(state.tempDbUrl);
}

export async function waitForHydration(page: Page) {
  await page.locator("form").first().waitFor({ state: "attached" });
  await page.waitForFunction(
    () => {
      const formEl = document.querySelector("form");
      return formEl !== null && Object.keys(formEl).some((key) => key.startsWith("__react"));
    },
    { timeout: 10_000 },
  );
}

export async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Login E2E" },
  });
  expect(response.ok()).toBeTruthy();
}

export async function createVerifiedUser(
  request: APIRequestContext,
  sql: Sql,
  email: string,
  password: string,
) {
  await signUp(request, email, password);
  await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
}
