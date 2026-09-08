import { joinCatalogPrintings } from "@openrift/shared/catalog-join";
import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
} from "@openrift/shared/types/api/catalog";
import type { Printing } from "@openrift/shared/types/catalog";

import type { Repos } from "../../../deps.js";
import {
  loadPrintingDecorations,
  resolveFallbackArt,
  resolveFoilTwin,
  resolveMarkers,
  toCatalogPrintingImage,
} from "../lib/printing-presenters.js";

/**
 * Assembles the full catalog (cards + printings + sets) server-side. One
 * assembly backs both the public `/catalog` route and dynamic list-rule
 * evaluation, which needs a server-side `Printing[]` to run `filterCards`
 * against.
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
  for (const {
    id,
    markerSlugs,
    fallbackArtMode,
    fallbackImageId,
    hasFoilTwin,
    ...rest
  } of printingRows) {
    const citations = citationsByPrinting.get(id);
    printings[id] = {
      ...rest,
      ...resolveFallbackArt({ fallbackArtMode, fallbackImageId }),
      ...resolveFoilTwin({ hasFoilTwin }),
      markers: resolveMarkers(markerSlugs, markerBySlug),
      distributionChannels: channelsByPrinting.get(id) ?? [],
      // Must be omitted, not an empty array (see `buildPrintingsResponse`):
      // every visitor downloads this bundle, so an uncited printing costs no bytes.
      ...(citations === undefined ? {} : { citations }),
      images: (imagesByPrinting.get(id) ?? []).map((image) => toCatalogPrintingImage(image)),
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
 * Printings store uppercase codes, so entries are uppercased. An unknown code
 * is not an error: it simply matches no printing.
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
 * share or memoize across requests. With no filter, returns the input itself.
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
 * The bundle a dynamic list rule needs to evaluate server-side: the flat
 * `Printing[]` plus the card→custom-tag-slug map. The map is required for
 * any rule filtering on `customTagSlugs` — `filterCards` reads tags only from
 * this lookup, so without it those dimensions silently match nothing. Both are
 * assembled from the same catalog read, so they share one content-version token
 * and never drift from each other.
 */
export interface RuleCatalog {
  printings: Printing[];
  customTagAssignments: Record<string, readonly string[]>;
}

export async function assembleRuleCatalog(repos: Repos): Promise<RuleCatalog> {
  const response = await assembleCatalogResponse(repos);
  return {
    printings: joinCatalogPrintings(response),
    customTagAssignments: response.customTagAssignments,
  };
}

/**
 * The cache entry must be set synchronously, with no `await` between the
 * version check and the assignment, or concurrent callers would each trigger their own assembly.
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
    // Fire-and-forget: awaiting here would defeat sharing the in-flight promise with concurrent callers.
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
