import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { collectionsRepo } from "../repositories/collections.js";

/**
 * Ensures the user has an inbox collection. Creates one if it doesn't exist.
 * @returns The inbox collection ID
 */
export function ensureInbox(db: Kysely<Database>, userId: string): Promise<string> {
  return collectionsRepo(db).ensureInbox(userId);
}
