import { createDb } from "../packages/shared/src/db/connect.js";
import { refreshCatalog } from "../packages/shared/src/services/refresh-catalog.js";

const db = createDb();
try {
  await refreshCatalog(db);
} finally {
  await db.destroy();
}
