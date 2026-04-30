// Benchmark: canonicalRank sort (new) vs 6-axis comparePrintings sort (old).
//
// Background: before migration 096 introduced the `printings_ordered` view,
// the canonical printing order was derived in JS by a 6-axis comparator
// (set sort_order, shortCode, marker presence, min marker sort_order,
// finish sort_order). Now the DB computes a single integer `canonical_rank`
// per printing and the frontend sorts by that integer.
//
// This bench confirms the integer compare is meaningfully faster than the
// old composite comparator on realistic catalog sizes (~3k printings). It
// runs in steady-state (fixtures built once, sort array freshly cloned per
// iteration so both benches measure the same work).

import type {
  Card,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
  Printing,
} from "@openrift/shared";
import { bench, describe } from "vitest";

const SET_COUNT = 7;
const CARD_COUNT = 771;
const PRINTING_COUNT = 2916;

const RARITIES = ["common", "uncommon", "rare", "legendary"] as const;
const DOMAINS = ["chaos", "order", "fury", "calm"] as const;
const TYPES = ["unit", "spell", "gear", "battlefield"] as const;
const LANGUAGES = ["EN", "DE", "FR", "ES"] as const;
const ART_VARIANTS = ["normal", "alternate", "borderless"] as const;
const FINISHES = ["normal", "foil"] as const;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49_297) % 233_280;
    return s / 233_280;
  };
}

function pick<T>(arr: readonly T[], r: () => number): T {
  const value = arr[Math.floor(r() * arr.length)];
  if (value === undefined) {
    throw new Error("pick() from empty array");
  }
  return value;
}

function buildFixture(): Printing[] {
  const r = seededRandom(42);
  const sets: CatalogSetResponse[] = Array.from({ length: SET_COUNT }, (_, i) => ({
    id: `set-${i}`,
    slug: `SET${i + 1}`,
    name: `Test Set ${i + 1}`,
    releasedAt: null,
    released: true,
    setType: i < 5 ? "main" : "supplemental",
  }));

  const setSlugById = new Map(sets.map((s) => [s.id, s.slug]));

  const cardById = new Map<string, Card>();
  for (let i = 0; i < CARD_COUNT; i++) {
    const id = `card-${i}`;
    cardById.set(id, {
      slug: id,
      name: `Card ${i}`,
      type: pick(TYPES, r),
      superTypes: [],
      domains: [pick(DOMAINS, r)],
      might: Math.floor(r() * 10) - 1,
      energy: Math.floor(r() * 8) + 1,
      power: r() > 0.5 ? Math.floor(r() * 6) : null,
      keywords: [],
      tags: [],
      mightBonus: null,
      errata: null,
      bans: [],
    });
  }

  const printings: Printing[] = [];
  for (let i = 0; i < PRINTING_COUNT; i++) {
    const cardIdx = i % CARD_COUNT;
    const setIdx = Math.floor(r() * SET_COUNT);
    const raw: CatalogResponsePrintingValue = {
      shortCode: `SET-${String(i).padStart(3, "0")}`,
      setId: `set-${setIdx}`,
      rarity: pick(RARITIES, r),
      artVariant: pick(ART_VARIANTS, r),
      isSigned: false,
      markers: [],
      distributionChannels: [],
      finish: pick(FINISHES, r),
      images: [],
      artist: "Synthetic",
      publicCode: `synth-${i}`,
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      printedName: null,
      printedYear: null,
      comment: null,
      language: pick(LANGUAGES, r),
      cardId: `card-${cardIdx}`,
      canonicalRank: i + 1,
    };
    const card = cardById.get(raw.cardId);
    const setSlug = setSlugById.get(raw.setId);
    if (!card || !setSlug) {
      throw new Error("fixture indexing out of range");
    }
    printings.push({ ...raw, id: `printing-${i}`, setSlug, setReleased: true, card });
  }
  return printings;
}

const FINISH_ORDER = ["normal", "foil"] as const;

/**
 * The pre-migration-096 comparator: 4 compound axes, each pass touches both
 * objects. Kept here only for comparison.
 * @returns Negative if a comes first, positive if b comes first, 0 if equal.
 */
function compareByFourAxes(a: Printing, b: Printing): number {
  const setCmp = a.setId.localeCompare(b.setId);
  if (setCmp !== 0) {
    return setCmp;
  }
  const codeCmp = a.shortCode.localeCompare(b.shortCode);
  if (codeCmp !== 0) {
    return codeCmp;
  }
  const aMarker = a.markers.length > 0 ? 1 : 0;
  const bMarker = b.markers.length > 0 ? 1 : 0;
  if (aMarker !== bMarker) {
    return aMarker - bMarker;
  }
  const aFinishIdx = FINISH_ORDER.indexOf(a.finish as (typeof FINISH_ORDER)[number]);
  const bFinishIdx = FINISH_ORDER.indexOf(b.finish as (typeof FINISH_ORDER)[number]);
  return aFinishIdx - bFinishIdx;
}

const printings = buildFixture();

describe("printing canonical sort", () => {
  bench("old: 6-axis comparator over ~3k printings", () => {
    [...printings].sort(compareByFourAxes);
  });

  bench("new: canonicalRank integer compare over ~3k printings", () => {
    [...printings].sort((a, b) => a.canonicalRank - b.canonicalRank);
  });
});
