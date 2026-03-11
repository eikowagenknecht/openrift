import type { Logger } from "../logger.js";
import type { GalleryCard } from "../schemas.js";
import { galleryCardSchema } from "../schemas.js";
import type { ArtVariant, CardStats, CardType, Rarity } from "../types.js";

// ── Output types ────────────────────────────────────────────────────────────

interface GameCard {
  name: string;
  type: CardType;
  superTypes: string[];
  domains: string[];
  stats: CardStats;
  keywords: string[];
  mightBonus: number | null;
  rulesText: string;
  effectText: string;
  tags: string[];
}

interface PrintingData {
  sourceId: string;
  cardId: string;
  set: string;
  collectorNumber: number;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  isPromo: boolean;
  art: { imageURL: string; artist: string };
  publicCode: string;
  printedRulesText: string;
  printedEffectText: string;
}

interface SetData {
  id: string;
  name: string;
  printedTotal: number;
}

interface CardsJson {
  sets: SetData[];
  cards: Record<string, GameCard>;
  printings: PrintingData[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const GALLERY_URL = "https://riftbound.leagueoflegends.com/en-us/card-gallery/";
const FETCH_TIMEOUT_MS = 10_000;

/** @internal Exported for testing only.
 * @returns Plain text with HTML tags and entities decoded.
 */
export function stripHtml(html: string) {
  const NAMED_ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&nbsp;": " ",
  };

  return html
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replaceAll(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replaceAll(
      /&(?:amp|lt|gt|quot|nbsp);/gi,
      (entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? entity,
    )
    .trim();
}

/** @internal Exported for testing only.
 * @returns Deduplicated list of bracketed keywords found in the text.
 */
export function parseKeywords(text: string) {
  const matches = text.match(/\[([A-Z][a-zA-Z\- ]+(?:\s+\d+)?)\]/g);
  if (!matches) {
    return [];
  }
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const m of matches) {
    const kw = m.slice(1, -1);
    if (!seen.has(kw)) {
      seen.add(kw);
      keywords.push(kw);
    }
  }
  return keywords;
}

/** Derive art variant from the source ID suffix.
 * @internal Exported for testing only.
 * @returns Art variant label and signed flag.
 */
export function deriveArtVariant(
  sourceId: string,
  collectorNumber: number,
  printedTotal: number,
): { artVariant: ArtVariant; isSigned: boolean } {
  const isSigned = sourceId.endsWith("*");
  const bare = isSigned ? sourceId.slice(0, -1) : sourceId;

  if (/[a-z]$/.test(bare)) {
    return { artVariant: "altart", isSigned };
  }
  if (collectorNumber > printedTotal) {
    return { artVariant: "overnumbered", isSigned };
  }
  return { artVariant: "normal", isSigned };
}

/** Strip variant suffixes to get the base card ID (e.g. "OGN-027a" → "OGN-027").
 * @internal Exported for testing only.
 * @returns Base source ID without variant suffixes.
 */
export function toBaseSourceId(sourceId: string): string {
  return sourceId.replace(/(?<=\d)[a-z*]+$/, "");
}

// ── Card conversion ─────────────────────────────────────────────────────────

interface ConvertedCard {
  sourceId: string;
  name: string;
  type: CardType;
  superTypes: string[];
  rarity: Rarity;
  collectorNumber: number;
  domains: string[];
  stats: CardStats;
  keywords: string[];
  description: string;
  effect: string;
  mightBonus: number | null;
  set: string;
  art: { imageURL: string; artist: string };
  tags: string[];
  publicCode: string;
  artVariant: ArtVariant;
  isSigned: boolean;
}

function convertCard(src: GalleryCard, printedTotal: number): ConvertedCard {
  const sourceId = src.publicCode.split("/")[0];
  const typeLabel = src.cardType.type[0]?.label;
  if (!typeLabel) {
    throw new Error(`Card "${src.name}" (${src.publicCode}) has no card type`);
  }
  const type = typeLabel as CardType;
  const superTypes = (src.cardType.superType ?? []).map((s) => s.label);
  const rarity = src.rarity.value.label as Rarity;
  const domains = src.domain.values.map((d) => d.label);

  const stats: CardStats = {
    might: src.might?.value.id ?? null,
    energy: src.energy?.value.id ?? null,
    power: src.power?.value.id ?? null,
  };

  const description = stripHtml(src.text.richText.body);
  const effect = src.effect ? stripHtml(src.effect.richText.body) : "";
  const mightBonus = src.mightBonus?.value.id ?? null;

  const keywords = [...new Set([...parseKeywords(description), ...parseKeywords(effect)])];

  const art = {
    imageURL: src.cardImage.url,
    artist: src.illustrator.values.map((a) => a.label).join(", "),
  };

  const setCode = sourceId.split("-")[0];
  const tags = src.tags?.tags ?? [];
  const { artVariant, isSigned } = deriveArtVariant(sourceId, src.collectorNumber, printedTotal);

  return {
    sourceId,
    name: src.name,
    type,
    superTypes,
    rarity,
    collectorNumber: src.collectorNumber,
    domains,
    stats,
    keywords,
    description,
    effect,
    mightBonus,
    set: setCode,
    art,
    tags,
    publicCode: src.publicCode,
    artVariant,
    isSigned,
  };
}

// ── Pipeline steps ──────────────────────────────────────────────────────────

function parseGalleryPage(html: string): unknown[] {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error("Could not find __NEXT_DATA__ script tag in the page");
  }

  let nextData;
  try {
    nextData = JSON.parse(match[1]);
  } catch {
    throw new Error("Malformed JSON in __NEXT_DATA__ script tag");
  }

  const blades = nextData.props?.pageProps?.page?.blades ?? [];
  const galleryBlade = blades.find((b: { type: string }) => b.type === "riftboundCardGallery");
  const rawCards = galleryBlade?.cards?.items;
  if (!rawCards || rawCards.length === 0) {
    throw new Error("Could not find riftboundCardGallery blade in __NEXT_DATA__");
  }

  return rawCards;
}

function validateCards(rawCards: unknown[], log: Logger): GalleryCard[] {
  const validated: GalleryCard[] = [];
  const errors: { id: string; issues: { path: PropertyKey[]; message: string }[] }[] = [];

  for (const raw of rawCards) {
    const result = galleryCardSchema.safeParse(raw);
    if (result.success) {
      validated.push(result.data);
    } else {
      const r = raw as { publicCode?: string; name?: string };
      const id = r.publicCode?.split("/")[0] ?? r.name ?? "unknown";
      errors.push({ id, issues: result.error.issues });
    }
  }

  if (errors.length > 0) {
    log.warn(`${errors.length} cards failed validation`);
    for (const e of errors.slice(0, 5)) {
      log.warn(
        `  ${e.id}: ${e.issues.map((i) => `${String(i.path.join("."))} - ${i.message}`).join(", ")}`,
      );
    }
    if (errors.length > 5) {
      log.warn(`  ...and ${errors.length - 5} more`);
    }
  }

  return validated;
}

function groupBySet(
  validated: GalleryCard[],
  log: Logger,
): {
  setMap: Map<string, SetData>;
  allConverted: ConvertedCard[];
} {
  const setOrder: string[] = [];
  const setMap = new Map<string, SetData>();
  const convertedBySet = new Map<string, ConvertedCard[]>();

  for (const raw of validated) {
    const setId = raw.set.value.id;
    const denominator = Number.parseInt(raw.publicCode.split("/")[1], 10) || 0;
    if (setMap.has(setId)) {
      const existing = setMap.get(setId);
      if (existing && denominator !== existing.printedTotal) {
        log.warn(
          `Card ${raw.publicCode} has denominator ${denominator} but set ${setId} expected ${existing.printedTotal}`,
        );
      }
    } else {
      setOrder.push(setId);
      const code = raw.publicCode.split("/")[0].split("-")[0];
      setMap.set(setId, { id: code, name: raw.set.value.label, printedTotal: denominator });
      convertedBySet.set(setId, []);
    }
    const set = setMap.get(setId);
    convertedBySet.get(setId)?.push(convertCard(raw, set?.printedTotal ?? 0));
  }

  for (const cards of convertedBySet.values()) {
    cards.sort((a, b) => a.collectorNumber - b.collectorNumber);
  }

  const allConverted = setOrder.flatMap((id) => convertedBySet.get(id) ?? []);
  return { setMap, allConverted };
}

function deduceGameCards(allConverted: ConvertedCard[]): {
  gameCards: Record<string, GameCard>;
  baseIdByName: Map<string, string>;
} {
  const byName = new Map<string, ConvertedCard[]>();
  for (const card of allConverted) {
    const group = byName.get(card.name) ?? [];
    group.push(card);
    byName.set(card.name, group);
  }

  const gameCards: Record<string, GameCard> = {};
  const baseIdByName = new Map<string, string>();

  const VARIANT_PENALTY: Record<ArtVariant, number> = {
    normal: 0,
    altart: 50,
    overnumbered: 30,
  };

  for (const [name, group] of byName) {
    const scored = group.map((card) => ({
      card,
      score: (card.isSigned ? 100 : 0) + VARIANT_PENALTY[card.artVariant],
    }));
    scored.sort((a, b) => a.score - b.score || a.card.collectorNumber - b.card.collectorNumber);
    const base = scored[0].card;
    const baseId = toBaseSourceId(base.sourceId);

    baseIdByName.set(name, baseId);
    gameCards[baseId] = {
      name: base.name,
      type: base.type,
      superTypes: base.superTypes,
      domains: base.domains,
      stats: base.stats,
      keywords: base.keywords,
      mightBonus: base.mightBonus,
      rulesText: base.description,
      effectText: base.effect,
      tags: base.tags,
    };
  }

  return { gameCards, baseIdByName };
}

function buildPrintings(
  allConverted: ConvertedCard[],
  baseIdByName: Map<string, string>,
): PrintingData[] {
  return allConverted.map((card) => ({
    sourceId: card.sourceId,
    cardId: baseIdByName.get(card.name) ?? card.sourceId,
    set: card.set,
    collectorNumber: card.collectorNumber,
    rarity: card.rarity,
    artVariant: card.artVariant,
    isSigned: card.isSigned,
    isPromo: false, // gallery never has promos; set via candidate import
    art: card.art,
    publicCode: card.publicCode,
    printedRulesText: card.description,
    printedEffectText: card.effect,
  }));
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetches the card catalog directly from the Riftbound gallery page,
 * validates, and transforms into the CardsJson format for DB upsert.
 * @returns Catalog data with sets, game cards, and printings.
 */
export async function fetchCatalog(log: Logger): Promise<CardsJson> {
  log.info(`Fetching ${GALLERY_URL}`);
  const res = await fetch(GALLERY_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const rawCards = parseGalleryPage(await res.text());
  log.info(`Fetched ${rawCards.length} raw cards from gallery`);

  const validated = validateCards(rawCards, log);
  log.info(`Validated ${validated.length}/${rawCards.length} cards`);

  const { setMap, allConverted } = groupBySet(validated, log);
  const { gameCards, baseIdByName } = deduceGameCards(allConverted);
  const printings = buildPrintings(allConverted, baseIdByName);
  const sets = [...setMap.values()];

  log.info(
    `Catalog: ${Object.keys(gameCards).length} game cards, ${printings.length} printings across ${sets.length} sets`,
  );

  return { sets, cards: gameCards, printings };
}
