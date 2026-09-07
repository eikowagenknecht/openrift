import type { APIRequestContext } from "@playwright/test";
import type postgres from "postgres";

import { API_BASE_URL, TEST_USERS, WEB_BASE_URL } from "./constants.js";

async function setupTestUser(
  request: APIRequestContext,
  sql: postgres.Sql,
  user: { email: string; password: string; name: string },
  storageStatePath: string,
) {
  const headers = { Origin: WEB_BASE_URL };

  // Tolerate "user already exists": the temp DB persists across UI sessions
  // while .auth/*.json lives on disk, so re-running auth.setup is expected.
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

  await sql`UPDATE users SET email_verified = true WHERE email = ${user.email}`;

  const signInResponse = await request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
    headers,
    data: { email: user.email, password: user.password },
  });

  if (!signInResponse.ok()) {
    const body = await signInResponse.text();
    throw new Error(`Sign-in failed for ${user.email}: ${signInResponse.status()} ${body}`);
  }

  await request.storageState({ path: storageStatePath });
}

async function promoteToAdmin(sql: postgres.Sql, email: string) {
  await sql`
    INSERT INTO admins (user_id)
    SELECT id FROM users WHERE email = ${email}
    ON CONFLICT DO NOTHING
  `;
}

export async function setupRegularUser(request: APIRequestContext, sql: postgres.Sql) {
  await setupTestUser(request, sql, TEST_USERS.regular, ".auth/user.json");
}

export async function setupAdminUser(request: APIRequestContext, sql: postgres.Sql) {
  await setupTestUser(request, sql, TEST_USERS.admin, ".auth/admin.json");
  await promoteToAdmin(sql, TEST_USERS.admin.email);
}
