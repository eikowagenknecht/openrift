import type { APIRequestContext } from "@playwright/test";
import type postgres from "postgres";

import { API_BASE_URL, TEST_USERS, WEB_BASE_URL } from "./constants.js";

/**
 * Sign up a test user via the better-auth API, bypass email verification
 * by updating the database directly, then sign in to get session cookies.
 *
 * The auth rate limiter is disabled in e2e via `DISABLE_AUTH_RATE_LIMIT=1`
 * (set in global-setup) — see `apps/api/src/app.ts`. The limiter itself is
 * covered by `apps/api/src/auth-rate-limit.integration.test.ts`.
 */
async function setupTestUser(
  request: APIRequestContext,
  sql: postgres.Sql,
  user: { email: string; password: string; name: string },
  storageStatePath: string,
) {
  const headers = { Origin: WEB_BASE_URL };

  // 1. Sign up via the real auth endpoint. Tolerate "user already exists"
  // because the temp DB persists across UI sessions while .auth/*.json lives
  // on disk — re-running auth.setup is expected.
  const signUpResponse = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers,
    data: { email: user.email, password: user.password, name: user.name },
  });

  if (!signUpResponse.ok()) {
    const body = await signUpResponse.text();
    if (!body.toLowerCase().includes("already exists")) {
      throw new Error(`Sign-up failed for ${user.email}: ${signUpResponse.status()} ${body}`);
    }
  }

  // 2. Mark email as verified directly in the database
  await sql`UPDATE users SET email_verified = true WHERE email = ${user.email}`;

  // 3. Sign in to get session cookies
  const signInResponse = await request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
    headers,
    data: { email: user.email, password: user.password },
  });

  if (!signInResponse.ok()) {
    const body = await signInResponse.text();
    throw new Error(`Sign-in failed for ${user.email}: ${signInResponse.status()} ${body}`);
  }

  // 4. Save storage state (cookies) to file
  await request.storageState({ path: storageStatePath });
}

/**
 * Promote a user to admin by inserting into the admins table.
 */
async function promoteToAdmin(sql: postgres.Sql, email: string) {
  await sql`
    INSERT INTO admins (user_id)
    SELECT id FROM users WHERE email = ${email}
    ON CONFLICT DO NOTHING
  `;
}

/**
 * Set up the regular test user and save authenticated state.
 */
export async function setupRegularUser(request: APIRequestContext, sql: postgres.Sql) {
  await setupTestUser(request, sql, TEST_USERS.regular, ".auth/user.json");
}

/**
 * Set up the admin test user, promote to admin, and save authenticated state.
 */
export async function setupAdminUser(request: APIRequestContext, sql: postgres.Sql) {
  await setupTestUser(request, sql, TEST_USERS.admin, ".auth/admin.json");
  await promoteToAdmin(sql, TEST_USERS.admin.email);
}
