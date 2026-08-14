/* oxlint-disable import/no-nodejs-modules -- standalone CLI script that hashes passwords with node's scrypt */
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

import { createDb } from "../apps/api/src/db/connect.js";
import { requireEnv } from "./env.js";

const DEFAULT_PASSWORD = "1111";

// scrypt parameters and the `salt:key` hex encoding come from
// `@better-auth/utils/password`, which better-auth uses for credential
// accounts. They are inlined because the root workspace cannot resolve
// better-auth (it is a dependency of apps/api only). If sign-in stops
// working after a better-auth upgrade, re-check that file.
const SCRYPT = { N: 16_384, r: 16, p: 1, dkLen: 64 };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Hashes a password the way better-auth does, so the result can be written
 * straight into `accounts.password`.
 *
 * @returns The `salt:key` hex hash.
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, SCRYPT.dkLen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  });
  return `${salt}:${key.toString("hex")}`;
}

/**
 * Throws unless the connection string points at a local database. Restoring a
 * dump and flattening every password is a dev-only operation.
 *
 * @returns Nothing.
 */
function assertLocalDatabase(connectionString: string): void {
  const host = new URL(connectionString).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run against a non-local database (host: ${host}). This script is for local dev only.`,
    );
  }
}

const password = process.argv[2] ?? DEFAULT_PASSWORD;
const databaseUrl = requireEnv("DATABASE_URL");
assertLocalDatabase(databaseUrl);

const { db } = createDb(databaseUrl);
const hash = hashPassword(password);

const updated = await db
  .updateTable("accounts")
  .set({ password: hash })
  .where("providerId", "=", "credential")
  .executeTakeFirst();

// Users who signed up through Google, Discord, or an email code have no
// credential account at all, so give them one. Otherwise they stay
// unreachable locally.
const withoutCredentials = await db
  .selectFrom("users")
  .select("id")
  .where(({ not, exists, selectFrom }) =>
    not(
      exists(
        selectFrom("accounts")
          .select("accounts.id")
          .whereRef("accounts.userId", "=", "users.id")
          .where("accounts.providerId", "=", "credential"),
      ),
    ),
  )
  .execute();

if (withoutCredentials.length > 0) {
  await db
    .insertInto("accounts")
    .values(
      withoutCredentials.map((user) => ({
        id: randomUUID(),
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hash,
      })),
    )
    .execute();
}

// Sign-in requires a verified email (`requireEmailVerification`), and the
// verification mail never arrives locally.
const verified = await db
  .updateTable("users")
  .set({ emailVerified: true })
  .where("emailVerified", "=", false)
  .executeTakeFirst();

console.log(`Password for every user set to "${password}".`);
console.log(`  ${updated.numUpdatedRows} existing credential account(s) updated`);
console.log(`  ${withoutCredentials.length} credential account(s) created`);
console.log(`  ${verified.numUpdatedRows} user(s) marked email-verified`);

await db.destroy();
