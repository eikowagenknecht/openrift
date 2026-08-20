import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  Printing,
} from "@openrift/shared";
import { isReleasedIn, todayUtc } from "@openrift/shared";

import type { Repos } from "../deps.js";
import {
  loadPrintingDecorations,
  resolveFallbackArt,
  resolveMarkers,
} from "../lib/printing-presenters.js";

/**
 * Assembles the full catalog (cards + printings + sets) server-side. Extracted
 * from the public `/catalog` route so the same assembly backs dynamic list-rule
 * evaluation (ADR-034), which needs a server-side `Printing[]` to run
 * `filterCards` against.
 *
 * @returns The catalog response (cards/printings keyed by id, sets as array).
 */
export async function assembleCatalogResponse(repos: Repos): Promise<CatalogResponse> {
  const { catalog } = repos;

  const [
    sets,
    cardRows,
    printingRows,
    imageRows,
    banRows,
    errataRows,
    totalCopies,
    customTagAssignmentsMap,
  ] = await Promise.all([
    catalog.sets(),
    catalog.cards(),
    catalog.printings(),
    catalog.printingImages(),
    catalog.cardBans(),
    catalog.cardErrata(),
    catalog.totalCopies(),
    repos.customTags.assignmentsByCard(),
  ]);

  const { markerBySlug, channelsByPrinting, citationsByPrinting } = await loadPrintingDecorations(
    repos,
    printingRows.map((p) => p.id),
  );

  const bansByCard = Map.groupBy(banRows, (r) => r.cardId);

  const errataByCard = new Map(
    errataRows.map((r) => [
      r.cardId,
      {
        correctedRulesText: r.correctedRulesText,
        correctedEffectText: r.correctedEffectText,
        source: r.source,
        sourceUrl: r.sourceUrl,
        effectiveDate: r.effectiveDate,
      },
    ]),
  );

  const cards: Record<string, CatalogResponseCardValue> = {};
  for (const { id, ...rest } of cardRows) {
    cards[id] = {
      ...rest,
      errata: errataByCard.get(id) ?? null,
      bans: (bansByCard.get(id) ?? []).map((b) => ({
        formatId: b.formatId,
        formatName: b.formatName,
        bannedAt: b.bannedAt,
        reason: b.reason,
      })),
    };
  }

  const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

  const printings: Record<string, CatalogResponsePrintingValue> = {};
  for (const { id, markerSlugs, fallbackArtMode, fallbackImageId, ...rest } of printingRows) {
    const citations = citationsByPrinting.get(id);
    printings[id] = {
      ...rest,
      ...resolveFallbackArt({ fallbackArtMode, fallbackImageId }),
      markers: resolveMarkers(markerSlugs, markerBySlug),
      distributionChannels: channelsByPrinting.get(id) ?? [],
      // Omitted rather than empty — see `buildPrintingsResponse`. This is the
      // bundle every visitor downloads, so an uncited printing costs no bytes.
      ...(citations === undefined ? {} : { citations }),
      images: (imagesByPrinting.get(id) ?? []).map((i) => ({
        face: i.face,
        imageId: i.imageId,
      })),
    };
  }

  return {
    sets,
    cards,
    printings,
    totalCopies,
    customTagAssignments: Object.fromEntries(customTagAssignmentsMap),
  };
}

/**
 * Parses a comma-joined language-code list ("EN,FR") into a normalized set.
 * Printings store uppercase codes, so entries are uppercased before comparing
 * and blanks are dropped. An unknown code is not an error: it simply matches no
 * printing.
 * @returns The uppercased codes.
 */
export function parseLanguageCodes(csv: string): Set<string> {
  const codes = new Set<string>();
  for (const part of csv.split(",")) {
    const code = part.trim().toUpperCase();
    if (code) {
      codes.add(code);
    }
  }
  return codes;
}

/**
 * Which printings a catalog variant keeps, as normalized code sets (see
 * {@link parseLanguageCodes}). The two are mutually exclusive, which the
 * contract enforces; both absent means the full catalog.
 */
export interface CatalogLanguageFilter {
  langs?: ReadonlySet<string>;
  exceptLangs?: ReadonlySet<string>;
}

/**
 * Copies the printing map, keeping only entries whose language passes `keep`.
 * @returns A new map with the surviving printings.
 */
function pickPrintingsByLanguage(
  printings: Record<string, CatalogResponsePrintingValue>,
  keep: (language: string) => boolean,
): Record<string, CatalogResponsePrintingValue> {
  const picked: Record<string, CatalogResponsePrintingValue> = {};
  for (const [id, printing] of Object.entries(printings)) {
    if (keep(printing.language.toUpperCase())) {
      picked[id] = printing;
    }
  }
  return picked;
}

/**
 * Derives a language-split variant of an assembled catalog (see the
 * `catalogContract` doc for why the split exists). `langs` keeps the full core
 * plus the printings in those languages; `exceptLangs` returns the complement
 * and empties `cards` + `customTagAssignments`, so a client that already holds
 * the core does not download it a second time. `sets` is kept either way, which
 * costs 3KB and leaves the tail response self-contained.
 *
 * Pure: the input is never mutated, so the assembly it came from stays safe to
 * share or memoize across requests.
 *
 * @returns The variant, or the input itself when no filter is given.
 */
export function filterCatalogResponseByLanguages(
  catalog: CatalogResponse,
  filter: CatalogLanguageFilter,
): CatalogResponse {
  const { langs, exceptLangs } = filter;
  if (langs) {
    return {
      ...catalog,
      printings: pickPrintingsByLanguage(catalog.printings, (language) => langs.has(language)),
    };
  }
  if (exceptLangs) {
    return {
      sets: catalog.sets,
      cards: {},
      printings: pickPrintingsByLanguage(
        catalog.printings,
        (language) => !exceptLangs.has(language),
      ),
      totalCopies: catalog.totalCopies,
      customTagAssignments: {},
    };
  }
  return catalog;
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
  // One "today" for the whole join, so two printings of the same set can't
  // land on opposite sides of a midnight that passes mid-assembly.
  const today = todayUtc();
  const printings: Printing[] = [];
  for (const [id, value] of Object.entries(catalog.printings)) {
    const set = setsById.get(value.setId);
    const card = cardsById[value.cardId];
    if (set && card) {
      printings.push({
        ...value,
        id,
        setSlug: set.slug,
        // A set is out in each language on its own date, and a printing knows
        // which language it is.
        setReleased: isReleasedIn(set.releases, value.language, today),
        card,
      });
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
export function createContentAddressedCache<T>(
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
