import { createDb } from "../apps/api/src/db/connect.js";
import { refreshTcgplayerPrices } from "../apps/api/src/services/price-refresh/tcgplayer.js";
import { createLogger } from "../packages/shared/src/logger.js";
import { requireEnv } from "./env.js";

const log = createLogger("tcgplayer");
const { db } = createDb(requireEnv("DATABASE_URL"));
try {
  await refreshTcgplayerPrices(db, log);
} finally {
  await db.destroy();
}
