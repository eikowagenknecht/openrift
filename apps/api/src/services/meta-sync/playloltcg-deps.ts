import type { Logger } from "@openrift/shared/logger";

import type { Repos, Transact } from "../../deps.js";
import type { Fetch } from "../../io.js";
import type { PlayloltcgClient } from "./playloltcg-client.js";
import { createPlayloltcgClient } from "./playloltcg-client.js";

export interface PlayloltcgSyncDeps {
  repos: Repos;
  transact: Transact;
  client: PlayloltcgClient;
  log: Logger;
  now?: () => Date;
}

export interface PlayloltcgSyncEnv {
  repos: Repos;
  transact: Transact;
  fetch: Fetch;
  log: Logger;
  baseUrl: string;
}

export function createPlayloltcgSyncDeps(env: PlayloltcgSyncEnv): PlayloltcgSyncDeps {
  return {
    repos: env.repos,
    transact: env.transact,
    log: env.log,
    client: createPlayloltcgClient({ fetch: env.fetch, baseUrl: env.baseUrl }),
  };
}

export function clock(deps: PlayloltcgSyncDeps): Date {
  return deps.now?.() ?? new Date();
}
