import { createDb } from "../packages/shared/src/db/connect.js";
import { migrate, rollback } from "../packages/shared/src/db/migrate.js";

const db = createDb();
const command = process.argv[2] ?? "latest";

try {
  if (command === "latest") {
    await migrate(db);
  } else if (command === "down") {
    await rollback(db);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Usage: db:migrate [latest|down]");
    process.exit(1);
  }
} catch (error) {
  console.error(command === "latest" ? "Migration failed:" : "Rollback failed:", error);
  process.exit(1);
} finally {
  await db.destroy();
}
