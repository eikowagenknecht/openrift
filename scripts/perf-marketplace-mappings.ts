import { createDb } from "../apps/api/src/db/connect.js";
import { createRepos } from "../apps/api/src/deps.js";
import { createMarketplaceConfigs } from "../apps/api/src/routes/admin/marketplace-configs.js";
import { getMappingOverview } from "../apps/api/src/services/marketplace-mapping.js";
import { buildUnifiedMappingsResponse } from "../apps/api/src/services/unified-mapping-merge.js";
import { requireEnv } from "./env.js";

const { db } = createDb(requireEnv("DATABASE_URL"));
const repos = createRepos(db);
const { tcgplayer, cardmarket, cardtrader } = createMarketplaceConfigs(repos);

await buildUnifiedMappingsResponse(
  repos,
  tcgplayer,
  cardmarket,
  cardtrader,
  getMappingOverview,
  false,
);

// Per-marketplace breakdown
console.log("=== single-marketplace getMappingOverview timing ===");
for (const cfg of [tcgplayer, cardmarket, cardtrader]) {
  const start = performance.now();
  await getMappingOverview(repos, cfg);
  console.log(`  ${cfg.marketplace}: ${(performance.now() - start).toFixed(1)}ms`);
}

const times: number[] = [];
let lastSize = 0;
let serializeMs = 0;
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  const result = await buildUnifiedMappingsResponse(
    repos,
    tcgplayer,
    cardmarket,
    cardtrader,
    getMappingOverview,
    false,
  );
  const buildMs = performance.now() - start;
  const serStart = performance.now();
  const json = JSON.stringify(result);
  serializeMs = performance.now() - serStart;
  lastSize = json.length;
  times.push(buildMs);
  console.log(`run ${i + 1}: build=${buildMs.toFixed(1)}ms  serialize=${serializeMs.toFixed(1)}ms`);
}

const avg = times.reduce((a, b) => a + b, 0) / times.length;
const sorted = [...times].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(`---`);
console.log(
  `avg: ${avg.toFixed(1)}ms  median: ${median.toFixed(1)}ms  size: ${(lastSize / 1024).toFixed(0)}KB`,
);

await db.destroy();
