import type { RuleKind, RulesListResponse } from "@openrift/shared/types/api/rules";

export interface RulesSnapshot {
  core: RulesListResponse;
  tournament: RulesListResponse;
}

interface RulesFetchers {
  fetchRules: (kind: RuleKind) => Promise<RulesListResponse>;
}

// Kept separate from CatalogCache so a rules fetch failure never blocks card lookups, or vice versa.
export class RulesCache {
  readonly #fetchers: RulesFetchers;
  #snapshot: RulesSnapshot | null = null;

  constructor(fetchers: RulesFetchers) {
    this.#fetchers = fetchers;
  }

  get snapshot(): RulesSnapshot | null {
    return this.#snapshot;
  }

  // Throws on fetch failure; the previous snapshot is left untouched.
  async refresh(): Promise<void> {
    const [core, tournament] = await Promise.all([
      this.#fetchers.fetchRules("core"),
      this.#fetchers.fetchRules("tournament"),
    ]);
    this.#snapshot = { core, tournament };
  }
}
