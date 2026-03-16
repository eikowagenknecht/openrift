import { createDb } from "../apps/api/src/db/connect.js";
import { requireEnv } from "./env.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: bun run scripts/make-admin.ts <email>");
  process.exit(1);
}

const { db } = createDb(requireEnv("DATABASE_URL"));

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
