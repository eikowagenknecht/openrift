/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import type { SetReleases } from "@openrift/shared/set-release";
import { earliestRelease, todayUtc } from "@openrift/shared/set-release";
import type { MetaScopeQuery } from "@openrift/shared/types/api/meta";
import { z } from "zod";

import { cycleIncludeExclude } from "@/features/cards/lib/filter-cycle";

/** Must accept a bare string as a one-element list: old links used a scalar param. */
const facetList = () =>
  z
    .union([z.string().transform((value) => [value]), z.array(z.string())])
    .optional()
    .catch(undefined);

/**
 * The scope every archive page narrows by, in the URL. Each field `.catch`es
 * to undefined, so a stale bookmark drops the bad value without crashing the
 * route. The three value facets are include/exclude pairs; an axis is never
 * both, enforced by {@link cycleScopeFacet}.
 */
export const metaScopeSearchSchema = z.object({
  era: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  formats: facetList(),
  formatsEx: facetList(),
  tiers: facetList(),
  tiersEx: facetList(),
  /** ISO 3166-1 alpha-2. */
  countries: facetList(),
  countriesEx: facetList(),
});

export type MetaScope = z.infer<typeof metaScopeSearchSchema>;

export const ERA_ALL = "all";
export const ERA_CUSTOM = "custom";

const DEFAULT_SCOPE_FORMATS: readonly string[] = ["constructed"];

/** One selectable stretch of archive time: a set's run, from its release to the next one's. */
export interface MetaEra {
  id: string;
  label: string;
  from: string;
  /** Last day, inclusive; null on the current era. */
  to: string | null;
}

/** An inclusive date-only window; either end may be open. */
export interface MetaDateRange {
  from?: string;
  to?: string;
}

/**
 * Which archived decks a browser asks the API for: the whole scope, plus who
 * the rows belong to and how many to send. The facets ride along un-applied;
 * the answer already matches the scope.
 */
export interface MetaDeckQuery extends MetaScopeQuery {
  legend?: string;
  /** As `/meta/players/{key}` spells it. */
  player?: string;
  limit?: number;
}

/**
 * What an archive route hands the scope bar. Each route builds its own:
 * `useNavigate` types its search reducer against the calling route, and an
 * unbound one narrows to `never`.
 */
export interface MetaScopeControls {
  scope: MetaScope;
  /** Undefined drops a facet; `{}` would write an empty one instead. */
  setScope: (patch: Partial<MetaScope>) => void;
  clearScope: () => void;
}

/** The set fields an era is derived from. */
export interface EraSet {
  slug: string;
  name: string;
  setType: "main" | "supplemental";
  releases: SetReleases;
}

/**
 * The eras the scope bar offers, newest first. Only main sets draw a
 * boundary; an era runs to the day before the next main set's release, so
 * eras tile the archive with no gap or overlap. Unreleased sets are excluded.
 */
export function deriveSetEras(sets: readonly EraSet[], today = todayUtc()): MetaEra[] {
  const dated = sets
    .filter((set) => set.setType === "main")
    .map((set) => ({ set, releasedAt: earliestRelease(set.releases)?.releasedAt ?? null }))
    .filter((entry) => entry.releasedAt !== null && entry.releasedAt <= today)
    .map((entry) => ({ set: entry.set, releasedAt: entry.releasedAt as string }))
    .toSorted((a, b) => a.releasedAt.localeCompare(b.releasedAt));

  return dated
    .map((entry, index) => {
      const nextEntry = dated[index + 1];
      return {
        id: entry.set.slug,
        label: entry.set.name,
        from: entry.releasedAt,
        to: nextEntry ? dayBefore(nextEntry.releasedAt) : null,
      };
    })
    .toReversed();
}

/**
 * The era a scope with no explicit choice stands for: the current set, which is
 * the first entry {@link deriveSetEras} returns, or undefined before any set has released.
 */
export function defaultEraId(eras: readonly MetaEra[]): string | undefined {
  return eras[0]?.id;
}

/** The date window a scope selection stands for, empty when the scope covers all of time. */
export function resolveScopeRange(scope: MetaScope, eras: readonly MetaEra[]): MetaDateRange {
  if (scope.era === ERA_ALL) {
    return {};
  }
  if (scope.era === ERA_CUSTOM) {
    return { from: scope.from, to: scope.to };
  }
  const era = eras.find((candidate) => candidate.id === (scope.era ?? defaultEraId(eras)));
  if (era === undefined) {
    return {};
  }
  return { from: era.from, to: era.to ?? undefined };
}

/**
 * The patch that returns a scope to all time, for the bar's reset control.
 * Typed over every key so a facet added later cannot quietly survive a reset.
 */
export const CLEARED_SCOPE: Record<keyof MetaScope, undefined> = {
  era: undefined,
  from: undefined,
  to: undefined,
  formats: undefined,
  formatsEx: undefined,
  tiers: undefined,
  tiersEx: undefined,
  countries: undefined,
  countriesEx: undefined,
};

/**
 * The scope that narrows nothing. An absent scope is not this: an absent era
 * resolves to the current set and an absent format to constructed.
 */
export const UNSCOPED: Pick<MetaScope, "era" | "formats"> = { era: ERA_ALL, formats: [] };

/** The facets a reader picks values on, as opposed to the era's single window. */
export type MetaScopeFacet = "formats" | "tiers" | "countries";

const META_SCOPE_FACETS: readonly MetaScopeFacet[] = ["formats", "tiers", "countries"];

/**
 * What a facet the URL says nothing about includes, per surface. Formats always
 * default to constructed; a page may add its own default for another facet.
 */
export type ScopeFacetDefaults = Partial<Record<MetaScopeFacet, readonly string[]>>;

/**
 * One facet's two buckets, in the order the cycling helpers read them. A
 * facet the URL says nothing about at all resolves to its default; a URL
 * carrying either of the facet's keys is taken as explicit, empty selection included.
 */
export function scopeFacetValues(
  scope: MetaScope,
  facet: MetaScopeFacet,
  defaults: ScopeFacetDefaults = {},
): { included: readonly string[]; excluded: readonly string[] } {
  const fallback = facet === "formats" ? DEFAULT_SCOPE_FORMATS : (defaults[facet] ?? []);
  switch (facet) {
    case "formats": {
      const untouched = scope.formats === undefined && scope.formatsEx === undefined;
      return {
        included: scope.formats ?? (untouched ? fallback : []),
        excluded: scope.formatsEx ?? [],
      };
    }
    case "tiers": {
      const untouched = scope.tiers === undefined && scope.tiersEx === undefined;
      return {
        included: scope.tiers ?? (untouched ? fallback : []),
        excluded: scope.tiersEx ?? [],
      };
    }
    default: {
      const untouched = scope.countries === undefined && scope.countriesEx === undefined;
      return {
        included: scope.countries ?? (untouched ? fallback : []),
        excluded: scope.countriesEx ?? [],
      };
    }
  }
}

function facetPatch(
  facet: MetaScopeFacet,
  included: string[],
  excluded: string[],
): Partial<MetaScope> {
  switch (facet) {
    case "formats": {
      return { formats: included, formatsEx: excluded };
    }
    case "tiers": {
      return { tiers: included, tiersEx: excluded };
    }
    default: {
      return { countries: included, countriesEx: excluded };
    }
  }
}

/**
 * The patch for one click on a facet's value: off → include → exclude → off,
 * the same cycle the card browser's filters run.
 */
export function cycleScopeFacet(
  scope: MetaScope,
  facet: MetaScopeFacet,
  value: string,
  defaults: ScopeFacetDefaults = {},
): Partial<MetaScope> {
  const { included, excluded } = scopeFacetValues(scope, facet, defaults);
  const next = cycleIncludeExclude(included, excluded, value);
  return facetPatch(facet, next.included, next.excluded);
}

/**
 * A scope patch merged into a route's existing search params, with empty
 * values ("", [], false) dropped and unknown params left untouched.
 */
export function nextScopeSearch(
  prev: Record<string, unknown>,
  patch: Partial<MetaScope>,
): Record<string, unknown> {
  return Object.fromEntries(
    // Explicitly `unknown`: a route's own params ride along in `prev`, and
    // inferring the merged type narrows them to the scope's own value types.
    Object.entries<unknown>({ ...prev, ...patch }).filter(([key, value]) => {
      if (value === undefined || value === "" || value === false) {
        return false;
      }
      if (Array.isArray(value) && value.length === 0) {
        // Absent means the surface's default; an emptied array must still survive.
        return key === "formats" || key === "tiers";
      }
      return true;
    }),
  );
}

/** Whether the scope differs from the page's default. An explicit all-time era counts as customized. */
export function isScopeCustomized(scope: MetaScope): boolean {
  return Object.keys(CLEARED_SCOPE).some((key) => scope[key as keyof MetaScope] !== undefined);
}

/**
 * Whether a scope holds back any of the archive, defaults included: with a
 * default era and format, the unnarrowed page is already a slice.
 */
export function isScopeRestricting(scope: MetaScope, eras: readonly MetaEra[]): boolean {
  const range = resolveScopeRange(scope, eras);
  if (range.from !== undefined || range.to !== undefined) {
    return true;
  }
  return META_SCOPE_FACETS.some((facet) => {
    const { included, excluded } = scopeFacetValues(scope, facet);
    return included.length > 0 || excluded.length > 0;
  });
}

/** Where each facet's excludes live on the wire. */
const SCOPE_EXCLUDE_KEYS = {
  formats: "formatsEx",
  tiers: "tiersEx",
  countries: "countriesEx",
} as const satisfies Record<MetaScopeFacet, keyof MetaScopeQuery>;

/** A facet that narrows nothing is omitted, never sent empty. */
export function metaScopeQueryFromScope(
  scope: MetaScope,
  eras: readonly MetaEra[],
  defaults: ScopeFacetDefaults = {},
): MetaScopeQuery {
  const range = resolveScopeRange(scope, eras);
  const query: MetaScopeQuery = {};
  if (range.from !== undefined) {
    query.from = range.from;
  }
  if (range.to !== undefined) {
    query.to = range.to;
  }
  for (const facet of META_SCOPE_FACETS) {
    const { included, excluded } = scopeFacetValues(scope, facet, defaults);
    if (included.length > 0) {
      query[facet] = [...included];
    }
    if (excluded.length > 0) {
      query[SCOPE_EXCLUDE_KEYS[facet]] = [...excluded];
    }
  }
  return query;
}

/**
 * A scope as one string, for the `key` that remounts a narrowed list: a
 * "show more" depth from one selection must not carry into the next.
 */
export function scopeKey(scope: MetaScope): string {
  const facets = META_SCOPE_FACETS.map((facet) => {
    const { included, excluded } = scopeFacetValues(scope, facet);
    return `${included.join(",")}!${excluded.join(",")}`;
  });
  return [scope.era ?? "", scope.from ?? "", scope.to ?? "", ...facets].join("|");
}

function dayBefore(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}
