import type { Logger } from "@openrift/shared/logger";

import type { Repos, Transact } from "../../deps.js";
import type { UvsClient } from "./uvsgames-client.js";

/**
 * What every sync entry point needs: the repos, a transaction opener for the
 * shared candidate ingest, the paced HTTP client, and a clock the tests pin.
 */
export interface MetaSyncDeps {
  repos: Repos;
  transact: Transact;
  client: UvsClient;
  log: Logger;
  now?: () => Date;
}

export function clock(deps: MetaSyncDeps): Date {
  return deps.now?.() ?? new Date();
}

/** The listing endpoint and the query every crawl carries. */
export const EVENTS_PATH = "/api/v2/events/";
export const GAME_SLUG = "riftbound";

/** The source's published event-template vocabulary. No key, no pagination. */
export const TEMPLATES_PATH = "/api/v2/event-configuration-templates/";

export function errorText(error: unknown, prefix: string): string {
  return `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
}
