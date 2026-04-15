/* Inspect the unified mappings response to find heavy sections. */
import { createDb } from "../apps/api/src/db/connect.js";
import { createRepos } from "../apps/api/src/deps.js";
import { createMarketplaceConfigs } from "../apps/api/src/routes/admin/marketplace-configs.js";
import { getMappingOverview } from "../apps/api/src/services/marketplace-mapping.js";
import { buildUnifiedMappingsResponse } from "../apps/api/src/services/unified-mapping-merge.js";
import { requireEnv } from "./env.js";

const { db } = createDb(requireEnv("DATABASE_URL"));
const repos = createRepos(db);
const { tcgplayer, cardmarket, cardtrader } = createMarketplaceConfigs(repos);

const result = await buildUnifiedMappingsResponse(
  repos,
  tcgplayer,
  cardmarket,
  cardtrader,
  getMappingOverview,
  false,
);

const total = JSON.stringify(result).length;
console.log(`TOTAL: ${(total / 1024).toFixed(0)}KB`);
console.log(
  `  .groups: ${(JSON.stringify(result.groups).length / 1024).toFixed(0)}KB  (n=${result.groups.length})`,
);
console.log(
  `  .unmatchedProducts: ${(JSON.stringify(result.unmatchedProducts).length / 1024).toFixed(0)}KB`,
);
console.log(
  `    tcgplayer: ${result.unmatchedProducts.tcgplayer.length}  cardmarket: ${result.unmatchedProducts.cardmarket.length}  cardtrader: ${result.unmatchedProducts.cardtrader.length}`,
);
console.log(
  `  .allCards: ${(JSON.stringify(result.allCards).length / 1024).toFixed(0)}KB  (n=${result.allCards.length})`,
);

// Drill into a sample group
if (result.groups.length > 0) {
  const g = result.groups[0];
  const gJson = JSON.stringify(g);
  console.log(`\nSample group (${g.cardName}): ${gJson.length} bytes`);
  console.log(`  printings: ${g.printings.length} (${JSON.stringify(g.printings).length} bytes)`);
  console.log(`  tcgplayer.stagedProducts: ${g.tcgplayer.stagedProducts.length}`);
  console.log(`  tcgplayer.assignedProducts: ${g.tcgplayer.assignedProducts.length}`);
  console.log(`  cardmarket.stagedProducts: ${g.cardmarket.stagedProducts.length}`);
  console.log(`  cardmarket.assignedProducts: ${g.cardmarket.assignedProducts.length}`);
  console.log(`  cardtrader.stagedProducts: ${g.cardtrader.stagedProducts.length}`);
  console.log(`  cardtrader.assignedProducts: ${g.cardtrader.assignedProducts.length}`);
}

// Count how many groups have zero staged/assigned in each marketplace section
let emptyCm = 0;
let emptyCt = 0;
let emptyTcg = 0;
for (const g of result.groups) {
  if (g.tcgplayer.stagedProducts.length === 0 && g.tcgplayer.assignedProducts.length === 0) {
    emptyTcg++;
  }
  if (g.cardmarket.stagedProducts.length === 0 && g.cardmarket.assignedProducts.length === 0) {
    emptyCm++;
  }
  if (g.cardtrader.stagedProducts.length === 0 && g.cardtrader.assignedProducts.length === 0) {
    emptyCt++;
  }
}
console.log(`\nGroups with all-empty marketplace sections:`);
console.log(`  tcgplayer empty: ${emptyTcg}/${result.groups.length}`);
console.log(`  cardmarket empty: ${emptyCm}/${result.groups.length}`);
console.log(`  cardtrader empty: ${emptyCt}/${result.groups.length}`);

// Fields per printing
if (result.groups.length > 0 && result.groups[0].printings.length > 0) {
  const p = result.groups[0].printings[0];
  console.log(`\nSample printing fields:`);
  for (const [k, v] of Object.entries(p)) {
    console.log(`  ${k}: ${typeof v} = ${JSON.stringify(v).slice(0, 60)}`);
  }
}

await db.destroy();
