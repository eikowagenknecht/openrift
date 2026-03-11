import { createDb } from "../packages/shared/src/db/connect.js";

const db = createDb();

const tcgSnapshots = await db.deleteFrom("tcgplayer_snapshots").execute();
console.log(`Deleted ${tcgSnapshots[0].numDeletedRows} tcgplayer_snapshots`);

const tcgSources = await db.deleteFrom("tcgplayer_sources").execute();
console.log(`Deleted ${tcgSources[0].numDeletedRows} tcgplayer_sources`);

const tcgStaging = await db.deleteFrom("tcgplayer_staging").execute();
console.log(`Deleted ${tcgStaging[0].numDeletedRows} tcgplayer_staging`);

const cmSnapshots = await db.deleteFrom("cardmarket_snapshots").execute();
console.log(`Deleted ${cmSnapshots[0].numDeletedRows} cardmarket_snapshots`);

const cmSources = await db.deleteFrom("cardmarket_sources").execute();
console.log(`Deleted ${cmSources[0].numDeletedRows} cardmarket_sources`);

const cmStaging = await db.deleteFrom("cardmarket_staging").execute();
console.log(`Deleted ${cmStaging[0].numDeletedRows} cardmarket_staging`);

await db.destroy();
console.log("Done — all price tables cleared.");
