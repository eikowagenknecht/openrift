import type { Logger } from "@openrift/shared/logger";

import type { Repos, Transact } from "../../deps.js";
import type { Fetch } from "../../io.js";
import type { MetaSyncDeps } from "./deps.js";
import { createUvsClient } from "./uvsgames-client.js";

export type { MetaSyncDeps } from "./deps.js";
export { acceptCatalogEvent, autoAcceptCatalogBacklog } from "./accept.js";
export type { MetaAutoAcceptSummary } from "./accept.js";
export { backfillCatalog, syncCatalog, isCatalogSyncNoop } from "./catalog-sync.js";
export type { MetaCatalogSyncResult } from "./catalog-sync.js";
export { deepFetchEvent } from "./deep-fetch.js";
export type { MetaDeepFetchResult } from "./deep-fetch.js";
export { isRecheckNoop, processRechecks, RECHECK_BATCH_SIZE } from "./recheck.js";
export type { MetaRecheckResult } from "./recheck.js";
export { createPlayloltcgSyncDeps } from "./playloltcg-deps.js";
export type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";
export { acceptPlayloltcgEvent, autoAcceptPlayloltcgBacklog } from "./playloltcg-accept.js";
export type { PlayloltcgAcceptSummary } from "./playloltcg-accept.js";
export {
  backfillPlayloltcg,
  fetchPlayloltcgEvent,
  isPlayloltcgRecheckNoop,
  isPlayloltcgSyncNoop,
  playloltcgCoolingDown,
  PLAYLOLTCG_RECHECK_BATCH_SIZE,
  processPlayloltcgRechecks,
  syncPlayloltcgCatalog,
} from "./playloltcg-sync.js";
export type {
  PlayloltcgBackfillOptions,
  PlayloltcgRecheckResult,
  PlayloltcgSyncResult,
} from "./playloltcg-sync.js";

/**
 * The kinds every meta sync run is recorded under. The admin sync panel reads
 * `job_runs` by this list, so a new job has to be named here to be visible.
 */
export const META_JOB_KINDS = [
  "meta.uvsgames_sync",
  "meta.uvsgames_backfill",
  "meta.uvsgames_recheck",
  "meta.uvsgames_event_fetch",
  "meta.uvsgames_auto_accept",
  "meta.playloltcg_sync",
  "meta.playloltcg_backfill",
  "meta.playloltcg_recheck",
  "meta.playloltcg_event_fetch",
  "meta.playloltcg_auto_accept",
] as const;

export interface MetaSyncEnv {
  repos: Repos;
  transact: Transact;
  fetch: Fetch;
  log: Logger;
  baseUrl: string;
}

/**
 * One client per run rather than one per process: the request counter is what
 * the job summary reports, and a shared counter would make every run's budget
 * unreadable.
 */
export function createMetaSyncDeps(env: MetaSyncEnv): MetaSyncDeps {
  return {
    repos: env.repos,
    transact: env.transact,
    log: env.log,
    client: createUvsClient({ fetch: env.fetch, baseUrl: env.baseUrl }),
  };
}
