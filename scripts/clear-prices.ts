import { sql } from "kysely";

import { createDb } from "../apps/api/src/db/connect.js";
import { requireEnv } from "./env.js";

const { db } = createDb(requireEnv("DATABASE_URL"));

// Delete all snapshots (must go before sources due to FK)
const snapshots = await sql`
  DELETE FROM marketplace_snapshots
`.execute(db);
console.log(`Deleted ${snapshots.numAffectedRows ?? 0} marketplace_snapshots`);

const sources = await db.deleteFrom("marketplace_sources").execute();
console.log(`Deleted ${sources[0].numDeletedRows} marketplace_sources`);

const staging = await db.deleteFrom("marketplace_staging").execute();
console.log(`Deleted ${staging[0].numDeletedRows} marketplace_staging`);

await db.destroy();
console.log("Done — all price tables cleared.");
