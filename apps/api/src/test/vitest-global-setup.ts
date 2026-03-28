/* oxlint-disable import/no-nodejs-modules -- setup script needs fs */
/**
 * Vitest global setup: creates a shared temp DB for integration tests.
 *
 * Sets process.env.INTEGRATION_DB_URL so that createTestContext/createDbContext
 * can connect to the temp DB. On teardown, the DB is dropped.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import { createDb } from "../db/connect.js";
import { migrate } from "../db/migrate.js";
import { createTempDb, dropTempDb, noop, noopLogger, replaceDbName } from "./integration-setup.js";

interface TestUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

const TEST_USERS: TestUser[] = [
  { id: "a0000000-0001-4000-a000-000000000001", email: "user-0001@test.com", isAdmin: false },
  { id: "a0000000-0002-4000-a000-000000000001", email: "user-0002@test.com", isAdmin: false },
  { id: "a0000000-0003-4000-a000-000000000001", email: "user-0003@test.com", isAdmin: false },
  { id: "a0000000-0004-4000-a000-000000000001", email: "user-0004@test.com", isAdmin: false },
  { id: "a0000000-0005-4000-a000-000000000001", email: "user-0005@test.com", isAdmin: false },
  { id: "a0000000-0006-4000-a000-000000000001", email: "user-0006@test.com", isAdmin: false },
  { id: "a0000000-0007-4000-a000-000000000001", email: "user-0007@test.com", isAdmin: false },
  { id: "a0000000-0008-4000-a000-000000000001", email: "user-0008@test.com", isAdmin: false },
  { id: "a0000000-0009-4000-a000-000000000001", email: "user-0009@test.com", isAdmin: false },
  { id: "a0000000-0010-4000-a000-000000000001", email: "admin-0010@test.com", isAdmin: false },
  { id: "a0000000-0011-4000-a000-000000000001", email: "admin-0011@test.com", isAdmin: true },
  { id: "a0000000-0012-4000-a000-000000000001", email: "admin-0012@test.com", isAdmin: true },
  { id: "a0000000-0013-4000-a000-000000000001", email: "admin-0013@test.com", isAdmin: true },
  { id: "a0000000-0014-4000-a000-000000000001", email: "admin-0014@test.com", isAdmin: true },
  { id: "a0000000-0015-4000-a000-000000000001", email: "admin-0015@test.com", isAdmin: true },
  { id: "a0000000-0016-4000-a000-000000000001", email: "admin-0016@test.com", isAdmin: false },
  { id: "a0000000-0017-4000-a000-000000000001", email: "admin-0017@test.com", isAdmin: true },
  { id: "a0000000-0018-4000-a000-000000000001", email: "admin-0018@test.com", isAdmin: true },
  { id: "a0000000-0019-4000-a000-000000000001", email: "admin-0019@test.com", isAdmin: true },
  { id: "a0000000-0020-4000-a000-000000000001", email: "admin-0020@test.com", isAdmin: true },
  { id: "a0000000-0021-4000-a000-000000000001", email: "admin-0021@test.com", isAdmin: true },
  { id: "a0000000-0022-4000-a000-000000000001", email: "svc-0022@test.com", isAdmin: false },
  { id: "a0000000-0023-4000-a000-000000000001", email: "user-0023@test.com", isAdmin: false },
  { id: "a0000000-0024-4000-a000-000000000001", email: "user-0024@test.com", isAdmin: false },
  { id: "a0000000-0025-4000-a000-000000000001", email: "repo-0025@test.com", isAdmin: false },
  { id: "a0000000-0026-4000-a000-000000000001", email: "repo-0026@test.com", isAdmin: false },
  { id: "a0000000-0027-4000-a000-000000000001", email: "repo-0027@test.com", isAdmin: false },
  { id: "a0000000-0028-4000-a000-000000000001", email: "repo-0028@test.com", isAdmin: false },
  { id: "a0000000-0029-4000-a000-000000000001", email: "repo-0029@test.com", isAdmin: false },
  { id: "a0000000-0030-4000-a000-000000000001", email: "repo-0030@test.com", isAdmin: false },
  { id: "a0000000-0031-4000-a000-000000000001", email: "repo-0031@test.com", isAdmin: true },
  { id: "a0000000-0032-4000-a000-000000000001", email: "repo-0032@test.com", isAdmin: false },
  { id: "a0000000-0033-4000-a000-000000000001", email: "repo-0033@test.com", isAdmin: false },
  { id: "a0000000-0034-4000-a000-000000000001", email: "repo-0034@test.com", isAdmin: false },
  { id: "a0000000-0035-4000-a000-000000000001", email: "repo-0035@test.com", isAdmin: false },
  { id: "a0000000-0036-4000-a000-000000000001", email: "repo-0036@test.com", isAdmin: false },
  { id: "a0000000-0037-4000-a000-000000000001", email: "repo-0037@test.com", isAdmin: false },
  { id: "a0000000-0038-4000-a000-000000000001", email: "repo-0038@test.com", isAdmin: false },
  { id: "a0000000-0039-4000-a000-000000000001", email: "repo-0039@test.com", isAdmin: false },
  { id: "a0000000-0040-4000-a000-000000000001", email: "repo-0040@test.com", isAdmin: false },
  { id: "a0000000-0041-4000-a000-000000000001", email: "repo-0041@test.com", isAdmin: false },
  { id: "a0000000-0042-4000-a000-000000000001", email: "repo-0042@test.com", isAdmin: false },
  { id: "a0000000-0043-4000-a000-000000000001", email: "repo-0043@test.com", isAdmin: false },
  { id: "a0000000-0044-4000-a000-000000000001", email: "user-0044@test.com", isAdmin: false },
  { id: "a0000000-0045-4000-a000-000000000001", email: "admin-0045@test.com", isAdmin: true },
  { id: "a0000000-0046-4000-a000-000000000001", email: "admin-0046@test.com", isAdmin: true },
  { id: "a0000000-0047-4000-a000-000000000001", email: "admin-0047@test.com", isAdmin: true },
  { id: "a0000000-0048-4000-a000-000000000001", email: "admin-0048@test.com", isAdmin: true },
  { id: "a0000000-0049-4000-a000-000000000001", email: "user-0049@test.com", isAdmin: false },
];

let tempDbName = "";
let databaseUrl = "";

export async function setup() {
  databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    console.log("DATABASE_URL not set — integration tests will skip");
    return;
  }

  tempDbName = await createTempDb(databaseUrl, "vitest");
  const testUrl = replaceDbName(databaseUrl, tempDbName);
  console.log(`Integration DB: ${tempDbName}`);

  const { db } = createDb(testUrl);
  await migrate(db, noopLogger);

  const seedSql = readFileSync(resolve(import.meta.dirname ?? ".", "fixtures/seed.sql"), "utf8");
  const sql = postgres(testUrl, { onnotice: noop });
  await sql.unsafe(seedSql);
  await sql.end();

  for (const user of TEST_USERS) {
    await db
      .insertInto("users")
      .values({
        id: user.id,
        email: user.email,
        name: "Test User",
        emailVerified: true,
        image: null,
      })
      .execute();
    if (user.isAdmin) {
      await db.insertInto("admins").values({ userId: user.id }).execute();
    }
  }
  await db.destroy();

  process.env.INTEGRATION_DB_URL = testUrl;
}

export async function teardown() {
  if (tempDbName && databaseUrl) {
    console.log(`Dropping ${tempDbName}...`);
    await dropTempDb(databaseUrl, tempDbName);
  }
}
