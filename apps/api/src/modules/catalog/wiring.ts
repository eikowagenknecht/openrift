import type { KeepPriorityOrders } from "@openrift/shared/list-rule-eval";
import type { Kysely } from "kysely";

import type { Database } from "../../db/index.js";
import type { Repos } from "../../deps.js";
import { artVariantsRepo } from "./repositories/art-variants.js";
import { canonicalPrintingsRepo } from "./repositories/canonical-printings.js";
import { cardBansRepo } from "./repositories/card-bans.js";
import { cardErrataRepo } from "./repositories/card-errata.js";
import { cardTokensRepo } from "./repositories/card-tokens.js";
import { cardTypesRepo } from "./repositories/card-types.js";
import { catalogDeleteGuardsRepo } from "./repositories/catalog-delete-guards.js";
import { catalogMutationsRepo } from "./repositories/catalog-mutations.js";
import { catalogRepo } from "./repositories/catalog.js";
import { distributionChannelsRepo } from "./repositories/distribution-channels.js";
import { domainsRepo } from "./repositories/domains.js";
import { enumsRepo } from "./repositories/enums.js";
import { finishesRepo } from "./repositories/finishes.js";
import { keywordsRepo } from "./repositories/keywords.js";
import { languagesRepo } from "./repositories/languages.js";
import { markersRepo } from "./repositories/markers.js";
import { printingCitationsRepo } from "./repositories/printing-citations.js";
import { printingEventsRepo } from "./repositories/printing-events.js";
import { printingImagesRepo } from "./repositories/printing-images.js";
import { raritiesRepo } from "./repositories/rarities.js";
import { rulesRepo } from "./repositories/rules.js";
import { setsRepo } from "./repositories/sets.js";
import { superTypesRepo } from "./repositories/super-types.js";
import { tagCategoriesRepo } from "./repositories/tag-categories.js";
import { tagDefinitionsRepo } from "./repositories/tag-definitions.js";
import { assembleRuleCatalog, createContentAddressedCache } from "./services/catalog-assembly.js";
import type { RuleCatalog } from "./services/catalog-assembly.js";

export interface CatalogRepos {
  artVariants: ReturnType<typeof artVariantsRepo>;
  cardBans: ReturnType<typeof cardBansRepo>;
  cardErrata: ReturnType<typeof cardErrataRepo>;
  cardTokens: ReturnType<typeof cardTokensRepo>;
  cardTypes: ReturnType<typeof cardTypesRepo>;
  canonicalPrintings: ReturnType<typeof canonicalPrintingsRepo>;
  catalog: ReturnType<typeof catalogRepo>;
  catalogDeleteGuards: ReturnType<typeof catalogDeleteGuardsRepo>;
  catalogMutations: ReturnType<typeof catalogMutationsRepo>;
  domains: ReturnType<typeof domainsRepo>;
  enums: ReturnType<typeof enumsRepo>;
  finishes: ReturnType<typeof finishesRepo>;
  keywords: ReturnType<typeof keywordsRepo>;
  languages: ReturnType<typeof languagesRepo>;
  printingImages: ReturnType<typeof printingImagesRepo>;
  printingCitations: ReturnType<typeof printingCitationsRepo>;
  markers: ReturnType<typeof markersRepo>;
  distributionChannels: ReturnType<typeof distributionChannelsRepo>;
  rarities: ReturnType<typeof raritiesRepo>;
  rules: ReturnType<typeof rulesRepo>;
  sets: ReturnType<typeof setsRepo>;
  superTypes: ReturnType<typeof superTypesRepo>;
  tagCategories: ReturnType<typeof tagCategoriesRepo>;
  tagDefinitions: ReturnType<typeof tagDefinitionsRepo>;
  printingEvents: ReturnType<typeof printingEventsRepo>;
}

export interface CatalogRuleSources {
  enums: ReturnType<typeof enumsRepo>;
  assembleCatalog: () => Promise<RuleCatalog>;
  enumOrders: () => Promise<KeepPriorityOrders>;
}

export function createCatalogRuleSources(
  db: Kysely<Database>,
  resolveRepos: () => Repos,
): CatalogRuleSources {
  const assembleCatalog = createContentAddressedCache(
    () => assembleRuleCatalog(resolveRepos()),
    () => catalogRepo(db).catalogContentVersion(),
  );

  const enums = enumsRepo(db);
  const loadEnums = createContentAddressedCache(
    () => enums.all(),
    () => enums.contentVersion(),
  );
  const cachedEnums = {
    ...enums,
    all: loadEnums,
    keepPriorityOrders: async () => {
      const rows = await loadEnums();
      return {
        finishes: rows.finishes.map((row) => row.slug),
        rarities: rows.rarities.map((row) => row.slug),
        artVariants: rows.artVariants.map((row) => row.slug),
      };
    },
  };

  return {
    enums: cachedEnums,
    assembleCatalog,
    enumOrders: () => cachedEnums.keepPriorityOrders(),
  };
}

export function createCatalogRepos(
  db: Kysely<Database>,
  sources: CatalogRuleSources,
): CatalogRepos {
  return {
    artVariants: artVariantsRepo(db),
    cardBans: cardBansRepo(db),
    cardErrata: cardErrataRepo(db),
    cardTokens: cardTokensRepo(db),
    cardTypes: cardTypesRepo(db),
    canonicalPrintings: canonicalPrintingsRepo(db),
    catalog: catalogRepo(db),
    catalogDeleteGuards: catalogDeleteGuardsRepo(db),
    catalogMutations: catalogMutationsRepo(db),
    domains: domainsRepo(db),
    enums: sources.enums,
    finishes: finishesRepo(db),
    keywords: keywordsRepo(db),
    languages: languagesRepo(db),
    printingImages: printingImagesRepo(db),
    printingCitations: printingCitationsRepo(db),
    markers: markersRepo(db),
    distributionChannels: distributionChannelsRepo(db),
    rarities: raritiesRepo(db),
    rules: rulesRepo(db),
    sets: setsRepo(db),
    superTypes: superTypesRepo(db),
    tagCategories: tagCategoriesRepo(db),
    tagDefinitions: tagDefinitionsRepo(db),
    printingEvents: printingEventsRepo(db),
  };
}
