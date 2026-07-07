import type { CatalogResponse, Printing } from "@openrift/shared";
import { assembleCatalogStaticParts } from "@openrift/shared/catalog-assembly";

import type { Repos } from "../deps.js";

/**
 * Assembles the full catalog (cards + printings + sets) server-side. Extracted
 * from the public `/catalog` route so the same assembly backs dynamic list-rule
 * evaluation (ADR-034), which needs a server-side `Printing[]` to run
 * `filterCards` against.
 *
 * The static parts (sets, cards, printings, custom-tag assignments) come from
 * the shared `assembleCatalogStaticParts` — the exact same pure transform the
 * synced web client runs over Electric rows (ADR-027), so the server response
 * and the client-assembled catalog can never drift. This function is a thin
 * DB-fetch + assembly + dynamic-merge caller; `totalCopies` is the only
 * dynamic field merged here.
 *
 * @returns The catalog response (cards/printings keyed by id, sets as array).
 */
export async function assembleCatalogResponse(repos: Repos): Promise<CatalogResponse> {
  const { catalog, distributionChannels, customTags } = repos;

  const [
    setRows,
    cardRows,
    printingRows,
    imageRows,
    banRows,
    errataRows,
    markerRows,
    allChannels,
    customTagAssignmentRows,
    totalCopies,
  ] = await Promise.all([
    catalog.sets(),
    catalog.cards(),
    catalog.printings(),
    catalog.printingImages(),
    catalog.cardBans(),
    catalog.cardErrata(),
    catalog.markersList(),
    distributionChannels.listAll(),
    customTags.assignmentRows(),
    catalog.totalCopies(),
  ]);

  const channelLinkRows = await distributionChannels.listForPrintingIds(
    printingRows.map((printing) => printing.id),
  );

  const staticParts = assembleCatalogStaticParts({
    setRows,
    cardRows,
    printingRows,
    imageRows,
    banRows,
    errataRows,
    markerRows,
    allChannels,
    channelLinkRows,
    customTagAssignmentRows,
  });

  return {
    ...staticParts,
    // Dynamic, per-request community scalar — never part of the synced shape.
    totalCopies,
  };
}

/**
 * Joins a {@link CatalogResponse} into the flat `Printing[]` shape that the
 * shared `filterCards` evaluator expects (mirrors the web `enrichCatalog`
 * join). Printings whose set or card is missing are dropped.
 * @returns Every printing with its card + set slug attached.
 */
function catalogResponseToPrintings(catalog: CatalogResponse): Printing[] {
  const setsById = new Map(catalog.sets.map((s) => [s.id, s]));
  const cardsById = catalog.cards;
  const printings: Printing[] = [];
  for (const [id, value] of Object.entries(catalog.printings)) {
    const set = setsById.get(value.setId);
    const card = cardsById[value.cardId];
    if (set && card) {
      printings.push({ ...value, id, setSlug: set.slug, setReleased: set.released, card });
    }
  }
  return printings;
}

/**
 * The bundle a dynamic list rule needs to evaluate server-side (ADR-034): the
 * flat `Printing[]` plus the card→custom-tag-slug map. The map is required for
 * any rule filtering on `customTagSlugs` — `filterCards` reads tags only from
 * this lookup, so without it those dimensions silently match nothing. Both are
 * assembled from the same catalog read, so they share one content-version token
 * and never drift from each other.
 */
export interface RuleCatalog {
  printings: Printing[];
  customTagAssignments: Record<string, readonly string[]>;
}

/**
 * Assemble the {@link RuleCatalog} (printings + custom-tag assignments) in one
 * catalog read, for dynamic list-rule evaluation.
 * @returns The server-assembled rule catalog.
 */
export async function assembleRuleCatalog(repos: Repos): Promise<RuleCatalog> {
  const response = await assembleCatalogResponse(repos);
  return {
    printings: catalogResponseToPrintings(response),
    customTagAssignments: response.customTagAssignments,
  };
}

/**
 * Wraps a catalog assembler in a process-wide, *content-addressed* memo for
 * dynamic list-rule expansion (ADR-034). Rule expansion calls the assembly
 * *inline* on every list read (including the uncached anonymous public-share
 * path), so without this each read rebuilds the entire catalog from the database.
 *
 * The memo is keyed on a `getVersion()` token (a cheap aggregate probe, see
 * `catalogContentVersion`) instead of a clock: every read re-probes, reuses the
 * cached value while the token is unchanged, and reassembles the instant an
 * admin edit rolls it. So reads are both cheap (probe ≪ assembly) and always
 * fresh — no staleness window, unlike a TTL.
 *
 * Concurrency: concurrent probes are coalesced into one, and because the cache
 * entry is set synchronously after the probe resolves (no `await` between the
 * version check and the assignment), a burst on a new version triggers a single
 * assembly that everyone shares. A rejected assembly is never cached (next call
 * retries); a transient probe failure serves the last good catalog rather than
 * breaking the read.
 *
 * @returns A zero-arg loader serving the memoized value for the live version.
 */
export function createCatalogPrintingsCache<T>(
  load: () => Promise<T>,
  getVersion: () => Promise<string>,
): () => Promise<T> {
  let cached: { version: string; value: Promise<T> } | null = null;
  let inflightProbe: Promise<string> | null = null;

  const probeVersion = async (): Promise<string> => {
    inflightProbe ??= getVersion();
    const probe = inflightProbe;
    try {
      return await probe;
    } finally {
      if (inflightProbe === probe) {
        inflightProbe = null;
      }
    }
  };

  return async () => {
    let version: string;
    try {
      version = await probeVersion();
    } catch (error) {
      // A transient probe failure must not break reads: serve the last good
      // catalog if we have one, else surface the error.
      if (cached) {
        return cached.value;
      }
      throw error;
    }
    if (cached && cached.version === version) {
      return cached.value;
    }
    const entry = { version, value: load() };
    // Drop a failed assembly so the next caller retries instead of being served a
    // rejected promise. Fire-and-forget on purpose: awaiting here would defeat
    // sharing the in-flight promise with concurrent callers, and the original
    // rejection still propagates to whoever awaits it.
    // oxlint-disable-next-line promise/prefer-await-to-then -- side-channel cleanup, must not await
    entry.value.catch(() => {
      if (cached === entry) {
        cached = null;
      }
    });
    cached = entry;
    return entry.value;
  };
}
