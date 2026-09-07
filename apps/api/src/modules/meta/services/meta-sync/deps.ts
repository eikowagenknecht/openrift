import type { Logger } from "@openrift/shared/logger";

import type { Repos, Transact } from "../../../../deps.js";
import type { UvsClient } from "./uvsgames-client.js";

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

export const EVENTS_PATH = "/api/v2/events/";
export const GAME_SLUG = "riftbound";
export const TEMPLATES_PATH = "/api/v2/event-configuration-templates/";

export function errorText(error: unknown, prefix: string): string {
  return `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
}
