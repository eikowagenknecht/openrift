import { createDb } from "../packages/shared/src/db/connect.js";
import { createLogger } from "../packages/shared/src/logger.js";
import { refreshTcgplayerPrices } from "../packages/shared/src/services/refresh-tcgplayer-prices.js";

const log = createLogger("tcgplayer");
const db = createDb();
try {
  await refreshTcgplayerPrices(db, log);
} finally {
  await db.destroy();
}
