/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import type { SetReleases } from "@openrift/shared";
import { earliestRelease, todayUtc } from "@openrift/shared";
import { z } from "zod";

import { cycleIncludeExclude } from "@/lib/filter-cycle";

/**
 * One facet's selection. A single bare value is read as a one-element list, so a
 * link written against the scalar params the bar used to carry still narrows.
 */
const facetList = () =>
  z
    .union([z.string().transform((value) => [value]), z.array(z.string())])
    .optional()
    .catch(undefined);

/**
 * The scope every archive page narrows by, in the URL (ADR-014). Each field is
 * optional and `.catch`es to undefined, so a stale bookmark loses the bad value
 * rather than crashing the route.
 *
 * The three value facets are include/exclude pairs (ADR-034), named the way the
 * card browser names its own: the bare key holds the includes and the `Ex`
 * companion the excludes. An axis is never both at once, which is what
 * {@link cycleScopeFacet} enforces.
 */
export const metaScopeSearchSchema = z.object({
  /**
   * A set slug, {@link ERA_ALL}, or {@link ERA_CUSTOM}. Absent means all time —
   * the same as {@link ERA_ALL}, which only ever appears once the reader has
   * picked it back. Single-valued: two eras with a gap between them are not a
   * window, and the archive scopes by window.
   */
  era: z.string().optional().catch(undefined),
  /** Inclusive event-date bounds as date-only strings; read only under {@link ERA_CUSTOM}. */
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

/** One selectable stretch of archive time: a set's run, from its release to the next one's. */
export interface MetaEra {
  /** The set's slug, which is what the URL carries. */
  id: string;
  label: string;
  /** First day of the era, inclusive. */
  from: string;
  /** Last day, inclusive. Null on the current era, which has no end yet. */
  to: string | null;
}

/** An inclusive date-only window; either end may be open. */
export interface MetaDateRange {
  from?: string;
  to?: string;
}

/**
 * What an archive route hands the scope bar. Each route builds its own from its
 * `getRouteApi`, because `useNavigate` types its search reducer against the
 * route it was called from and an unbound one narrows to `never`. The merging
 * itself is shared: {@link nextScopeSearch} and {@link CLEARED_SCOPE}.
 */
export interface MetaScopeControls {
  scope: MetaScope;
  /** Merges a patch into the URL; undefined drops a facet rather than writing an empty one. */
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
 * The eras the scope bar offers, newest first.
 *
 * Only main sets draw a boundary: a supplemental product released mid-season
 * does not start a new one, and treating it as if it did would cut a season's
 * events in two. An era runs to the day before the next main set, so the
 * windows tile the whole archive with no gap and no overlap.
 *
 * Unreleased sets are left out — an era nothing has happened in yet is a dead
 * option in the dropdown.
 */
export function deriveSetEras(sets: readonly EraSet[], today = todayUtc()): MetaEra[] {
  const dated = sets
    .filter((set) => set.setType === "main")
    .map((set) => ({ set, releasedAt: earliestRelease(set.releases)?.releasedAt ?? null }))
    .filter((entry) => entry.releasedAt !== null && entry.releasedAt <= today)
    .map((entry) => ({ set: entry.set, releasedAt: entry.releasedAt as string }))
    .toSorted((a, b) => a.releasedAt.localeCompare(b.releasedAt));

  return dated
    .map((entry, index) => ({
      id: entry.set.slug,
      label: entry.set.name,
      from: entry.releasedAt,
      to: index + 1 < dated.length ? dayBefore(dated[index + 1].releasedAt) : null,
    }))
    .toReversed();
}

/**
 * The date window a scope selection stands for.
 *
 * @returns The window, empty when the scope covers all of time.
 */
export function resolveScopeRange(scope: MetaScope, eras: readonly MetaEra[]): MetaDateRange {
  if (scope.era === undefined || scope.era === ERA_ALL) {
    return {};
  }
  if (scope.era === ERA_CUSTOM) {
    return { from: scope.from, to: scope.to };
  }
  const era = eras.find((candidate) => candidate.id === scope.era);
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

/** The facets a reader picks values on, as opposed to the era's single window. */
export type MetaScopeFacet = "formats" | "tiers" | "countries";

/** Every facet, for the callers that walk all three. */
export const META_SCOPE_FACETS: readonly MetaScopeFacet[] = ["formats", "tiers", "countries"];

/** One facet's two buckets, in the order the cycling helpers read them. */
export function scopeFacetValues(
  scope: MetaScope,
  facet: MetaScopeFacet,
): { included: readonly string[]; excluded: readonly string[] } {
  switch (facet) {
    case "formats": {
      return { included: scope.formats ?? [], excluded: scope.formatsEx ?? [] };
    }
    case "tiers": {
      return { included: scope.tiers ?? [], excluded: scope.tiersEx ?? [] };
    }
    default: {
      return { included: scope.countries ?? [], excluded: scope.countriesEx ?? [] };
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
 * the same cycle the card browser's filters run (ADR-034).
 */
export function cycleScopeFacet(
  scope: MetaScope,
  facet: MetaScopeFacet,
  value: string,
): Partial<MetaScope> {
  const { included, excluded } = scopeFacetValues(scope, facet);
  const next = cycleIncludeExclude(included, excluded, value);
  return facetPatch(facet, next.included, next.excluded);
}

/** The patch that takes one value off a facet, whichever bucket it sits in. */
export function dropScopeFacetValue(
  scope: MetaScope,
  facet: MetaScopeFacet,
  value: string,
): Partial<MetaScope> {
  const { included, excluded } = scopeFacetValues(scope, facet);
  return facetPatch(
    facet,
    included.filter((entry) => entry !== value),
    excluded.filter((entry) => entry !== value),
  );
}

/**
 * A scope patch merged into a route's existing search params.
 *
 * Empty values are dropped rather than written as "", so the unnarrowed view
 * keeps a clean URL and the back button does not step through states that look
 * identical. Params the scope knows nothing about ride along untouched, which is
 * what lets one bar sit on four routes.
 */
export function nextScopeSearch(
  prev: Record<string, unknown>,
  patch: Partial<MetaScope>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...prev, ...patch }).filter(([, value]) => {
      if (value === undefined || value === "") {
        return false;
      }
      return !(Array.isArray(value) && value.length === 0);
    }),
  );
}

/**
 * Whether a scope narrows anything at all, for the "N events" framing and the
 * reset control.
 */
export function isScopeNarrowed(scope: MetaScope): boolean {
  const range = scope.era === ERA_CUSTOM ? [scope.from, scope.to] : [];
  const dates = [scope.era === ERA_ALL ? undefined : scope.era, ...range];
  if (dates.some((value) => value !== undefined && value !== "")) {
    return true;
  }
  return META_SCOPE_FACETS.some((facet) => {
    const { included, excluded } = scopeFacetValues(scope, facet);
    return included.length > 0 || excluded.length > 0;
  });
}

/**
 * A scope as one string, for the `key` that remounts a narrowed list. A section
 * holding a "show more" depth is showing a slice of one selection, and carrying
 * that depth into the next selection would show a slice of a list the reader
 * never scrolled.
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
