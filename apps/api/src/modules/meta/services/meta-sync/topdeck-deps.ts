import type { Logger } from "@openrift/shared/logger";

import type { Repos, Transact } from "../../../../deps.js";
import type { Fetch } from "../../../../io.js";
import type { TopdeckClient } from "./topdeck-client.js";
import { createTopdeckClient } from "./topdeck-client.js";

export interface TopdeckSyncDeps {
  repos: Repos;
  transact: Transact;
  client: TopdeckClient;
  log: Logger;
  now?: () => Date;
}

export interface TopdeckSyncEnv {
  repos: Repos;
  transact: Transact;
  fetch: Fetch;
  log: Logger;
  baseUrl: string;
  apiKey: string;
}

export function createTopdeckSyncDeps(env: TopdeckSyncEnv): TopdeckSyncDeps {
  return {
    repos: env.repos,
    transact: env.transact,
    log: env.log,
    client: createTopdeckClient({
      fetch: env.fetch,
      baseUrl: env.baseUrl,
      apiKey: env.apiKey,
    }),
  };
}

export function clock(deps: TopdeckSyncDeps): Date {
  return deps.now?.() ?? new Date();
}
