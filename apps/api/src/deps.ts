import type { Kysely } from "kysely";

import type { Database } from "./db/index.js";
import { instrumentRepo } from "./db/instrumented-repo.js";
import { createCandidatesRepos, createCandidatesServices } from "./modules/candidates/wiring.js";
import type { CandidatesRepos, CandidatesServices } from "./modules/candidates/wiring.js";
import { createCatalogRepos, createCatalogRuleSources } from "./modules/catalog/wiring.js";
import type { CatalogRepos } from "./modules/catalog/wiring.js";
import {
  createCollectionsRepos,
  createCollectionsServices,
  createOwnedCopiesReader,
} from "./modules/collections/wiring.js";
import type { CollectionsRepos, CollectionsServices } from "./modules/collections/wiring.js";
import { createDecksRepos } from "./modules/decks/wiring.js";
import type { DecksRepos } from "./modules/decks/wiring.js";
import type { TradeEmailDeps } from "./modules/groups/services/trade-notifications.js";
import { createGroupsRepos, createGroupsServices } from "./modules/groups/wiring.js";
import type { GroupsRepos, GroupsServices } from "./modules/groups/wiring.js";
import { createListsRepos, createListsServices } from "./modules/lists/wiring.js";
import type { ListsRepos, ListsServices } from "./modules/lists/wiring.js";
import {
  createMarketplaceRepos,
  createMarketplaceServices,
  createRulePriceLookup,
} from "./modules/marketplace/wiring.js";
import type { MarketplaceRepos, MarketplaceServices } from "./modules/marketplace/wiring.js";
import { createMetaRepos, createMetaServices } from "./modules/meta/wiring.js";
import type { MetaRepos, MetaServices } from "./modules/meta/wiring.js";
import { createScanRepos, createScanServices } from "./modules/scan/wiring.js";
import type { ScanRepos, ScanServices } from "./modules/scan/wiring.js";
import { createStageRepos } from "./modules/stage/wiring.js";
import type { StageRepos } from "./modules/stage/wiring.js";
import { createSystemRepos, createSystemServices } from "./modules/system/wiring.js";
import type { SystemRepos, SystemServices } from "./modules/system/wiring.js";
import { createTournamentsRepos } from "./modules/tournaments/wiring.js";
import type { TournamentsRepos } from "./modules/tournaments/wiring.js";
import { createUsersRepos } from "./modules/users/wiring.js";
import type { UsersRepos } from "./modules/users/wiring.js";

export type Repos = CandidatesRepos &
  CatalogRepos &
  CollectionsRepos &
  DecksRepos &
  GroupsRepos &
  ListsRepos &
  MarketplaceRepos &
  MetaRepos &
  ScanRepos &
  StageRepos &
  SystemRepos &
  TournamentsRepos &
  UsersRepos;

export type Services = CandidatesServices &
  CollectionsServices &
  GroupsServices &
  ListsServices &
  MarketplaceServices &
  MetaServices &
  ScanServices &
  SystemServices;

function instrumentModules(modules: readonly object[]): Repos {
  const slots: Record<string, unknown> = {};
  for (const module of modules) {
    for (const [name, repo] of Object.entries(module)) {
      if (name in slots) {
        throw new Error(`Two modules declare the repository slot "${name}".`);
      }
      slots[name] = instrumentRepo(name, repo as Record<string, unknown>);
    }
  }
  return slots as unknown as Repos;
}

export function createRepos(db: Kysely<Database>): Repos {
  const catalogSources = createCatalogRuleSources(db, () => createRepos(db));
  const ruleProviders = {
    assembleCatalog: catalogSources.assembleCatalog,
    ownedCopies: createOwnedCopiesReader(db),
    enumOrders: catalogSources.enumOrders,
    priceLookup: createRulePriceLookup(db),
  };

  return instrumentModules([
    createCandidatesRepos(db),
    createCatalogRepos(db, catalogSources),
    createCollectionsRepos(db),
    createDecksRepos(db),
    createGroupsRepos(db, ruleProviders),
    createListsRepos(db, ruleProviders),
    createMarketplaceRepos(db),
    createMetaRepos(db),
    createScanRepos(db),
    createStageRepos(db),
    createSystemRepos(db),
    createTournamentsRepos(db),
    createUsersRepos(db),
  ]);
}

export type Transact = <T>(fn: (repos: Repos) => Promise<T>) => Promise<T>;

export function createTransact(db: Kysely<Database>): Transact {
  return <T>(fn: (repos: Repos) => Promise<T>) =>
    db.transaction().execute((trx) => fn(createRepos(trx)));
}

export function createServices(emailDeps?: TradeEmailDeps): Services {
  return {
    ...createCandidatesServices(emailDeps),
    ...createCollectionsServices(),
    ...createGroupsServices(emailDeps),
    ...createListsServices(),
    ...createMarketplaceServices(),
    ...createMetaServices(),
    ...createScanServices(),
    ...createSystemServices(),
  };
}

export const services: Services = createServices();
