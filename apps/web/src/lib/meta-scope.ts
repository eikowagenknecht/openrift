/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import type { SetReleases } from "@openrift/shared";
import { earliestRelease, todayUtc } from "@openrift/shared";
import { z } from "zod";

/**
 * The scope every archive page narrows by, in the URL (ADR-014). Each field is
 * optional and `.catch`es to undefined, so a stale bookmark loses the bad value
 * rather than crashing the route.
 */
export const metaScopeSearchSchema = z.object({
  /**
   * A set slug, {@link ERA_ALL}, or {@link ERA_CUSTOM}. Absent means all time —
   * the same as {@link ERA_ALL}, which only ever appears once the reader has
   * picked it back.
   */
  era: z.string().optional().catch(undefined),
  /** Inclusive event-date bounds as date-only strings; read only under {@link ERA_CUSTOM}. */
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  format: z.string().optional().catch(undefined),
  tier: z.string().optional().catch(undefined),
  /** ISO 3166-1 alpha-2. */
  country: z.string().optional().catch(undefined),
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
  format: undefined,
  tier: undefined,
  country: undefined,
};

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
    Object.entries({ ...prev, ...patch }).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );
}

/**
 * Whether a scope narrows anything at all, for the "N events" framing and the
 * reset control.
 */
export function isScopeNarrowed(scope: MetaScope): boolean {
  const range = scope.era === ERA_CUSTOM ? [scope.from, scope.to] : [];
  const facets = [
    scope.era === ERA_ALL ? undefined : scope.era,
    scope.format,
    scope.tier,
    scope.country,
    ...range,
  ];
  return facets.some((value) => value !== undefined && value !== "");
}

function dayBefore(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}
