/* Profile each step inside getMappingOverview for tcgplayer */
import { createDb } from "../apps/api/src/db/connect.js";
import { createRepos } from "../apps/api/src/deps.js";
import { createMarketplaceConfigs } from "../apps/api/src/routes/admin/marketplace-configs.js";
import { requireEnv } from "./env.js";

const { db } = createDb(requireEnv("DATABASE_URL"));
const repos = createRepos(db);
const { tcgplayer } = createMarketplaceConfigs(repos);
const repo = repos.marketplaceMapping;
const marketplace = tcgplayer.marketplace;

async function timeIt<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  console.log(`${label}: ${(performance.now() - start).toFixed(1)}ms`);
  return result;
}

// Warm
await Promise.all([
  repo.ignoredProducts(marketplace),
  repo.ignoredVariants(marketplace),
  repo.allStaging(marketplace),
  repo.groupNames(marketplace),
  repo.allCardsWithPrintings(marketplace),
  repo.stagingCardOverrides(marketplace),
]);

console.log("=== individual queries (warm, sequential) ===");
await timeIt("  ignoredProducts", () => repo.ignoredProducts(marketplace));
await timeIt("  ignoredVariants", () => repo.ignoredVariants(marketplace));
await timeIt("  allStaging", () => repo.allStaging(marketplace));
await timeIt("  groupNames", () => repo.groupNames(marketplace));
await timeIt("  allCardsWithPrintings", () => repo.allCardsWithPrintings(marketplace));
await timeIt("  stagingCardOverrides", () => repo.stagingCardOverrides(marketplace));

console.log("\n=== same queries, parallel ===");
const start = performance.now();
await Promise.all([
  repo.ignoredProducts(marketplace),
  repo.ignoredVariants(marketplace),
  repo.allStaging(marketplace),
  repo.groupNames(marketplace),
  repo.allCardsWithPrintings(marketplace),
  repo.stagingCardOverrides(marketplace),
]);
console.log(`  total parallel: ${(performance.now() - start).toFixed(1)}ms`);

console.log("\n=== three marketplaces in parallel (each fans out 6 queries) ===");
const { cardmarket, cardtrader } = createMarketplaceConfigs(repos);
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  await Promise.all(
    [tcgplayer, cardmarket, cardtrader].map(async (cfg) => {
      const m = cfg.marketplace;
      await Promise.all([
        repo.ignoredProducts(m),
        repo.ignoredVariants(m),
        repo.allStaging(m),
        repo.groupNames(m),
        repo.allCardsWithPrintings(m),
        repo.stagingCardOverrides(m),
      ]);
    }),
  );
  console.log(`  run ${i + 1}: ${(performance.now() - t0).toFixed(1)}ms`);
}

await db.destroy();
