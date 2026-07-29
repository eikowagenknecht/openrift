import { createApiClients } from "./api-client.js";
import { createBot } from "./bot.js";
import { CatalogCache } from "./catalog-cache.js";
import { readBotEnv } from "./env.js";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const STARTUP_RETRY_MS = 15 * 1000;

const env = readBotEnv();
const api = createApiClients(env.apiUrl);
const cache = new CatalogCache({
  fetchCatalog: () => api.catalog.catalog({}),
  fetchInit: () => api.init.get(),
  fetchPrices: () => api.prices.prices(),
});

// The API container may still be booting when the bot starts (compose gates on
// its healthcheck, but a fresh deploy can race); retry until the catalog loads.
while (cache.snapshot === null) {
  try {
    await cache.refresh();
  } catch (error) {
    console.error(`Catalog fetch failed, retrying in ${STARTUP_RETRY_MS / 1000}s`, error);
    await Bun.sleep(STARTUP_RETRY_MS);
  }
}
console.log(`Catalog loaded: ${cache.snapshot.cards.length} cards`);

async function refreshSafely(): Promise<void> {
  try {
    await cache.refresh();
  } catch (error) {
    console.error("Catalog refresh failed, keeping previous snapshot", error);
  }
}

setInterval(() => void refreshSafely(), REFRESH_INTERVAL_MS);

const client = createBot({ env, api, cache });

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down`);
  try {
    await client.destroy();
  } finally {
    process.exit(0);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}

await client.login(env.token);
