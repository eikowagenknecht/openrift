import { createDb } from "../packages/shared/src/db/connect.js";
import { refreshCardmarketPrices } from "../packages/shared/src/services/refresh-cardmarket-prices.js";

const db = createDb();
try {
  await refreshCardmarketPrices(db);
} finally {
  await db.destroy();
}
