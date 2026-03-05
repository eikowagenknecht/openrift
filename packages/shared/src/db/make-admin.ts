/* oxlint-disable no-console -- CLI script */

/**
 * Grants admin privileges to a user by email.
 *
 * Usage: bun run --cwd packages/shared src/db/make-admin.ts user@example.com
 */

import { createDb } from "./connect.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: bun run src/db/make-admin.ts <email>");
  process.exit(1);
}

const db = createDb();

const user = await db
  .selectFrom("users")
  .select(["id", "email"])
  .where("email", "=", email)
  .executeTakeFirst();

if (!user) {
  console.error(`No user found with email: ${email}`);
  await db.destroy();
  process.exit(1);
}

await db
  .insertInto("admins")
  .values({ user_id: user.id })
  .onConflict((oc) => oc.column("user_id").doNothing())
  .execute();

console.log(`Admin granted to ${user.email} (${user.id})`);
await db.destroy();
