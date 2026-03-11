import { createDb } from "../packages/shared/src/db/connect.js";
import { createLogger } from "../packages/shared/src/logger.js";
import { refreshCatalog } from "../packages/shared/src/services/refresh-catalog.js";
import { requireEnv } from "./env.js";

const log = createLogger("catalog");
const { db } = createDb(requireEnv("DATABASE_URL"));
try {
  await refreshCatalog(db, log);
} finally {
  await db.destroy();
}
