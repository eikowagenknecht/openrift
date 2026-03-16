import { createDb } from "../apps/api/src/db/connect.js";
import { migrate, rollback } from "../apps/api/src/db/migrate.js";
import { createLogger } from "../packages/shared/src/logger.js";
import { requireEnv } from "./env.js";

const log = createLogger("migrate");
const { db } = createDb(requireEnv("DATABASE_URL"));
const command = process.argv[2] ?? "latest";

try {
  if (command === "latest") {
    await migrate(db, log);
  } else if (command === "down") {
    await rollback(db, log);
  } else {
    log.error(`Unknown command: ${command}`);
    log.error("Usage: db:migrate [latest|down]");
    process.exit(1);
  }
} catch (error) {
  log.error(error, command === "latest" ? "Migration failed" : "Rollback failed");
  process.exit(1);
} finally {
  await db.destroy();
}
