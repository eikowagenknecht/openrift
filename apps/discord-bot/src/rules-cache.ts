import type { RuleKind, RulesListResponse } from "@openrift/shared";

export interface RulesSnapshot {
  core: RulesListResponse;
  tournament: RulesListResponse;
}

interface RulesFetchers {
  fetchRules: (kind: RuleKind) => Promise<RulesListResponse>;
}

/**
 * In-memory cache of the latest core and tournament rules, mirroring
 * `CatalogCache`: rebuilt from the API on startup and on every refresh, and a
 * failed refresh keeps the previous snapshot. Kept separate from the catalog
 * cache so a rules fetch problem never blocks card lookups (or vice versa).
 */
export class RulesCache {
  #fetchers: RulesFetchers;
  #snapshot: RulesSnapshot | null = null;

  constructor(fetchers: RulesFetchers) {
    this.#fetchers = fetchers;
  }

  /** @returns The latest snapshot, or null before the first successful refresh. */
  get snapshot(): RulesSnapshot | null {
    return this.#snapshot;
  }

  /**
   * Re-fetches both rule kinds and swaps the snapshot atomically. Throws on
   * fetch failure and keeps the previous snapshot.
   */
  async refresh(): Promise<void> {
    const [core, tournament] = await Promise.all([
      this.#fetchers.fetchRules("core"),
      this.#fetchers.fetchRules("tournament"),
    ]);
    this.#snapshot = { core, tournament };
  }
}
