import { createDb } from "../apps/api/src/db/connect.js";
import { requireEnv } from "./env.js";

const { db } = createDb(requireEnv("DATABASE_URL"));

const row = await db
  .selectFrom("candidateCards")
  .selectAll()
  .where("provider", "=", "riftbinder")
  .where("name", "=", "Jinx Rebel")
  .executeTakeFirst();

if (!row) {
  console.log("No row found");
  await db.destroy();
  process.exit(1);
}

const FIELDS = [
  "name",
  "type",
  "superTypes",
  "domains",
  "might",
  "energy",
  "power",
  "mightBonus",
  "rulesText",
  "effectText",
  "tags",
  "shortCode",
  "externalId",
  "extraData",
] as const;

for (const f of FIELDS) {
  const a = row[f];
  const isObj = typeof a === "object" && a !== null;

  console.log(
    f.padEnd(20),
    `typeof=${typeof a}`.padEnd(16),
    `isArray=${Array.isArray(a)}`.padEnd(14),
    isObj ? JSON.stringify(a).slice(0, 60) : String(a),
  );
}

await db.destroy();
