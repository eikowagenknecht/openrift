import { createDb } from "../apps/api/src/db/connect.js";
import { refreshCardmarketPrices } from "../apps/api/src/services/price-refresh/cardmarket.js";
import { createLogger } from "../packages/shared/src/logger.js";
import { requireEnv } from "./env.js";

const log = createLogger("cardmarket");
const { db } = createDb(requireEnv("DATABASE_URL"));
try {
  await refreshCardmarketPrices(db, log);
} finally {
  await db.destroy();
}
