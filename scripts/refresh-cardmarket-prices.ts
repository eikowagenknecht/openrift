import { createDb } from "../packages/shared/src/db/connect.js";
import { createLogger } from "../packages/shared/src/logger.js";
import { refreshCardmarketPrices } from "../packages/shared/src/services/refresh-cardmarket-prices.js";
import { requireEnv } from "./env.js";

const log = createLogger("cardmarket");
const { db } = createDb(requireEnv("DATABASE_URL"));
try {
  await refreshCardmarketPrices(db, log);
} finally {
  await db.destroy();
}
