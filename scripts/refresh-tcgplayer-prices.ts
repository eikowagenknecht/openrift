import { createDb } from "../packages/shared/src/db/connect.js";
import { refreshTcgplayerPrices } from "../packages/shared/src/services/refresh-tcgplayer-prices.js";

const db = createDb();
try {
  await refreshTcgplayerPrices(db);
} finally {
  await db.destroy();
}
