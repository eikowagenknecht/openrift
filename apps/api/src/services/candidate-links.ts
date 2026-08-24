/**
 * The single implementation of "which live card and printing does this
 * candidate row point at?".
 *
 * Three services resolve the same links: the batch provider ingest
 * (`ingest-candidates.ts`), the in-app user-submission ingest
 * (`ingest-user-submission.ts`, ADR-036) and the relink pass
 * (`relink-candidates.ts`). They were written as three separate copies and had
 * already drifted: commit a5fadf8ed uppercased short codes on both sides of the
 * key and dropped the rarity requirement from the gate, but only touched two of
 * the three, so a user submission with a lowercase `public_code` or without a
 * rarity stayed permanently unlinked. Keeping the key and the gate here is what
 * stops that recurring.
 *
 * The name→card half is also what the meta archive's deck ingest resolves
 * against (`ingest-meta-candidates.ts`, ADR-014), so an alias added once applies
 * to every pipeline. That consumer needs no printing lookups, hence the narrower
 * {@link CardNameIndex} it loads instead of the full index.
 */
import { normalizeNameForIdentity } from "@openrift/shared/utils";

import { buildPrintingLinkKey } from "../lib/printing-link-key.js";
import type { ingestRepo } from "../repositories/ingest.js";

/** The live-catalog lookups that resolve a card *name* to a card id. */
export interface CardNameIndex {
  /** Normalized card name to live card id. */
  cardIdByNorm: Map<string, string>;
  /** Normalized alias to live card id, consulted after {@link cardIdByNorm}. */
  cardIdByAliasNorm: Map<string, string>;
}

/** Live catalog lookups the candidate link resolution reads. */
export interface CandidateLinkIndex extends CardNameIndex {
  /** {@link buildPrintingLinkKey} output to live printing id. */
  printingIdByKey: Map<string, string>;
  /**
   * `"<provider>:<externalId>:<finish>"` to the manually pinned live printing
   * id. Provider '' is the legacy wildcard (pre-scoping rows, migration 253);
   * resolution consults the candidate's own provider first, the wildcard
   * second, so two providers reusing the same external id can't hijack each
   * other's pins.
   */
  printingIdByOverrideKey: Map<string, string>;
}

interface CardNameSources {
  cardNorms: readonly { id: string; normName: string }[];
  aliases: readonly { cardId: string; normName: string }[];
}

interface CandidateLinkSources extends CardNameSources {
  printings: readonly {
    id: string;
    shortCode: string;
    finish: string;
    markerSlugs: string[];
    language: string;
  }[];
  linkOverrides: readonly {
    externalId: string;
    finish: string;
    provider: string;
    printingId: string;
  }[];
}

/** The subset of the ingest repo {@link loadCardNameIndex} reads. */
export type CardNameRepo = Pick<
  ReturnType<typeof ingestRepo>,
  "allCardNorms" | "allCardNameAliases"
>;

/** The subset of the ingest repo {@link loadCandidateLinkIndex} reads. */
export type CandidateLinkRepo = CardNameRepo &
  Pick<ReturnType<typeof ingestRepo>, "allPrintingKeys" | "allPrintingLinkOverrides">;

/**
 * Index the live cards and aliases a name lookup reads.
 * @param sources Bulk-fetched card norm names and aliases.
 * @returns The two name lookup maps.
 */
function buildCardNameIndex(sources: CardNameSources): CardNameIndex {
  return {
    cardIdByNorm: new Map(sources.cardNorms.map((c) => [c.normName, c.id])),
    cardIdByAliasNorm: new Map(sources.aliases.map((a) => [a.normName, a.cardId])),
  };
}

/**
 * Index the live catalog rows the resolution needs.
 * @param sources Bulk-fetched cards, aliases, printings and link overrides.
 * @returns The lookup maps consumed by the resolvers below.
 */
export function buildCandidateLinkIndex(sources: CandidateLinkSources): CandidateLinkIndex {
  return {
    ...buildCardNameIndex(sources),
    printingIdByKey: new Map(sources.printings.map((p) => [buildPrintingLinkKey(p), p.id])),
    printingIdByOverrideKey: new Map(
      sources.linkOverrides.map((r) => [`${r.provider}:${r.externalId}:${r.finish}`, r.printingId]),
    ),
  };
}

/**
 * Bulk-fetch and index just the name→card lookups, for callers that resolve
 * card names but never printings (the meta archive's deck ingest).
 * @param repo The ingest repo (transactional or not).
 * @returns The built {@link CardNameIndex}.
 */
export async function loadCardNameIndex(repo: CardNameRepo): Promise<CardNameIndex> {
  const [cardNorms, aliases] = await Promise.all([repo.allCardNorms(), repo.allCardNameAliases()]);
  return buildCardNameIndex({ cardNorms, aliases });
}

/**
 * Bulk-fetch and index everything the candidate link resolution reads.
 * @param repo The ingest repo (transactional or not).
 * @returns The built {@link CandidateLinkIndex}.
 */
export async function loadCandidateLinkIndex(repo: CandidateLinkRepo): Promise<CandidateLinkIndex> {
  const [cardNorms, aliases, printings, linkOverrides] = await Promise.all([
    repo.allCardNorms(),
    repo.allCardNameAliases(),
    repo.allPrintingKeys(),
    repo.allPrintingLinkOverrides(),
  ]);
  return buildCandidateLinkIndex({ cardNorms, aliases, printings, linkOverrides });
}

/**
 * Resolve a candidate card's name to a live card, by normalized name first and
 * by alias second.
 * @param index The live catalog index.
 * @param name The candidate card name as submitted.
 * @returns The live card id, or null when nothing matches.
 */
export function resolveCardIdByName(index: CardNameIndex, name: string): string | null {
  // An empty key means the name held no letters or digits at all, so it
  // identifies nothing — resolving on it would link this candidate to whichever
  // unrelated card normalized the same way.
  const normName = normalizeNameForIdentity(name);
  if (normName === "") {
    return null;
  }
  return index.cardIdByNorm.get(normName) ?? index.cardIdByAliasNorm.get(normName) ?? null;
}

/**
 * Resolve a candidate printing to a live printing: a manual link override
 * first (it survives delete + re-upload), then the composite key.
 *
 * Rarity is deliberately not part of the gate: it isn't part of the key, and
 * requiring it left sources that report a finish but no rarity permanently
 * unlinked.
 *
 * @param index The live catalog index.
 * @param candidate The candidate printing, with whether its card resolved.
 * @returns The live printing id, or null when nothing matches.
 */
export function resolvePrintingLink(
  index: CandidateLinkIndex,
  candidate: {
    /** The candidate card's source provider, scoping which pins apply. */
    provider: string;
    externalId: string;
    shortCode: string;
    finish: string | null;
    markerSlugs: readonly string[];
    language: string | null;
    /** Whether the owning candidate card resolved to a live card. */
    cardLinked: boolean;
  },
): string | null {
  const override =
    index.printingIdByOverrideKey.get(
      `${candidate.provider}:${candidate.externalId}:${candidate.finish ?? ""}`,
    ) ?? index.printingIdByOverrideKey.get(`:${candidate.externalId}:${candidate.finish ?? ""}`);
  if (override) {
    return override;
  }
  if (!candidate.cardLinked || !candidate.finish) {
    return null;
  }
  const key = buildPrintingLinkKey({
    shortCode: candidate.shortCode,
    finish: candidate.finish,
    markerSlugs: candidate.markerSlugs,
    language: candidate.language,
  });
  return index.printingIdByKey.get(key) ?? null;
}
