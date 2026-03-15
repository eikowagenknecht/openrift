import { dropTempDb, listTestDatabases } from "../packages/shared/src/test/integration-setup.js";
import { requireEnv } from "./env.js";

const databaseUrl = requireEnv("DATABASE_URL");
const databases = await listTestDatabases(databaseUrl);

if (databases.length === 0) {
  console.log("No test databases to clean up.");
  process.exit(0);
}

console.log(`Dropping ${databases.length} test database(s)...`);
for (const name of databases) {
  await dropTempDb(databaseUrl, name);
  console.log(`  dropped ${name}`);
}

console.log("Done.");
