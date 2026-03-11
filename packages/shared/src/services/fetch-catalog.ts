import { galleryCardSchema } from "../schemas.js";
import type { CardStats, CardType, Rarity } from "../types.js";

// ── Public types ────────────────────────────────────────────────────────────

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
  artVariant: string;
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

function stripHtml(html: string) {
  return html
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .trim();
}

function parseKeywords(text: string) {
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

interface ConvertedCard {
  sourceId: string;
  name: string;
  type: string;
  superTypes: string[];
  rarity: string;
  collectorNumber: number;
  domains: string[];
  stats: { might: number | null; energy: number | null; power: number | null };
  keywords: string[];
  description: string;
  effect: string;
  mightBonus: number | null;
  set: string;
  art: { imageURL: string; artist: string };
  tags: string[];
  publicCode: string;
}

// oxlint-disable-next-line typescript/no-explicit-any -- raw gallery data before validation
function convertCard(src: any): ConvertedCard {
  const sourceId = src.publicCode.split("/")[0];
  const type = src.cardType.type[0]?.label ?? "Unit";
  const superTypes = (src.cardType.superType ?? []).map((s: { label: string }) => s.label);
  const rarity = src.rarity.value.label;
  const domains = src.domain.values.map((d: { label: string }) => d.label);

  const stats = {
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
    artist: src.illustrator.values.map((a: { label: string }) => a.label).join(", "),
  };

  const setCode = sourceId.split("-")[0];
  const tags = src.tags?.tags ?? [];

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
  };
}

/** Derive art variant from the source ID suffix.
 * @returns Art variant label and signed flag.
 */
function deriveArtVariant(
  sourceId: string,
  collectorNumber: number,
  printedTotal: number,
): { artVariant: string; isSigned: boolean } {
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
 * @returns Base source ID without variant suffixes.
 */
function toBaseSourceId(sourceId: string): string {
  return sourceId.replace(/[a-z*]+$/, "");
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetches the card catalog directly from the Riftbound gallery page,
 * validates, and transforms into the CardsJson format for DB upsert.
 * @returns Catalog data with sets, game cards, and printings.
 */
export async function fetchCatalog(): Promise<CardsJson> {
  // ── Fetch ─────────────────────────────────────────────────────────────
  console.log(`Fetching ${GALLERY_URL} ...`);
  const res = await fetch(GALLERY_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const html = await res.text();

  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error("Could not find __NEXT_DATA__ script tag in the page");
  }

  const nextData = JSON.parse(match[1]);
  const blades = nextData.props?.pageProps?.page?.blades ?? [];
  const galleryBlade = blades.find((b: { type: string }) => b.type === "riftboundCardGallery");
  const rawCards = galleryBlade?.cards?.items;
  if (!rawCards || rawCards.length === 0) {
    throw new Error("Could not find riftboundCardGallery blade in __NEXT_DATA__");
  }

  console.log(`Fetched ${rawCards.length} raw cards from gallery`);

  // ── Validate ──────────────────────────────────────────────────────────
  const validated = [];
  const errors: { id: string; issues: { path: PropertyKey[]; message: string }[] }[] = [];
  for (const raw of rawCards) {
    const result = galleryCardSchema.safeParse(raw);
    if (result.success) {
      validated.push(result.data);
    } else {
      const id = raw.publicCode?.split("/")[0] ?? raw.name ?? "unknown";
      errors.push({ id, issues: result.error.issues });
    }
  }
  if (errors.length > 0) {
    console.warn(`${errors.length} cards failed validation:`);
    for (const e of errors.slice(0, 5)) {
      console.warn(
        `  ${e.id}: ${e.issues.map((i) => `${String(i.path.join("."))} - ${i.message}`).join(", ")}`,
      );
    }
    if (errors.length > 5) {
      console.warn(`  ...and ${errors.length - 5} more`);
    }
  }
  console.log(`Validated ${validated.length}/${rawCards.length} cards`);

  // ── Group by set ──────────────────────────────────────────────────────
  const setOrder: string[] = [];
  const setMap = new Map<string, { id: string; name: string; printedTotal: number }>();
  const convertedBySet = new Map<string, ConvertedCard[]>();

  for (const raw of validated) {
    const setId = raw.set.value.id;
    if (!setMap.has(setId)) {
      setOrder.push(setId);
      const printedTotal = Number.parseInt(raw.publicCode.split("/")[1], 10) || 0;
      const code = raw.publicCode.split("/")[0].split("-")[0];
      setMap.set(setId, { id: code, name: raw.set.value.label, printedTotal });
      convertedBySet.set(setId, []);
    }
    convertedBySet.get(setId)?.push(convertCard(raw));
  }

  const printedTotalByCode = new Map<string, number>();
  for (const set of setMap.values()) {
    printedTotalByCode.set(set.id, set.printedTotal);
  }

  for (const cards of convertedBySet.values()) {
    cards.sort((a, b) => a.collectorNumber - b.collectorNumber);
  }

  // ── Deduce game cards ─────────────────────────────────────────────────
  const allConverted: ConvertedCard[] = [];
  for (const setId of setOrder) {
    allConverted.push(...(convertedBySet.get(setId) ?? []));
  }

  const byName = new Map<string, ConvertedCard[]>();
  for (const card of allConverted) {
    const group = byName.get(card.name) ?? [];
    group.push(card);
    byName.set(card.name, group);
  }

  const gameCards: Record<string, GameCard> = {};
  const baseIdByName = new Map<string, string>();

  for (const [name, group] of byName) {
    const scored = group.map((card) => {
      const printedTotal = printedTotalByCode.get(card.set) ?? 999;
      const { artVariant, isSigned } = deriveArtVariant(
        card.sourceId,
        card.collectorNumber,
        printedTotal,
      );
      let score = 0;
      if (isSigned) {
        score += 100;
      }
      if (artVariant === "altart") {
        score += 50;
      }
      if (artVariant === "overnumbered") {
        score += 30;
      }
      return { card, score };
    });
    scored.sort((a, b) => a.score - b.score || a.card.collectorNumber - b.card.collectorNumber);
    const base = scored[0].card;
    const baseId = toBaseSourceId(base.sourceId);

    baseIdByName.set(name, baseId);
    gameCards[baseId] = {
      name: base.name,
      type: base.type as CardType,
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

  // ── Build printings ───────────────────────────────────────────────────
  const printings: PrintingData[] = [];

  for (const card of allConverted) {
    const printedTotal = printedTotalByCode.get(card.set) ?? 999;
    const { artVariant, isSigned } = deriveArtVariant(
      card.sourceId,
      card.collectorNumber,
      printedTotal,
    );
    const cardId = baseIdByName.get(card.name) ?? card.sourceId;

    printings.push({
      sourceId: card.sourceId,
      cardId,
      set: card.set,
      collectorNumber: card.collectorNumber,
      rarity: card.rarity as Rarity,
      artVariant,
      isSigned,
      isPromo: false,
      art: card.art,
      publicCode: card.publicCode,
      printedRulesText: card.description,
      printedEffectText: card.effect,
    });
  }

  // ── Build sets ────────────────────────────────────────────────────────
  const orderedSets = setOrder
    .map((code) => setMap.get(code))
    .filter((s): s is { id: string; name: string; printedTotal: number } => s !== undefined)
    .sort((a, b) => {
      const order = ["Proving Grounds", "Origins", "Spiritforged"];
      const ai = order.indexOf(a.name);
      const bi = order.indexOf(b.name);
      return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
    });

  const sets: SetData[] = orderedSets.map((s) => ({
    id: s.id,
    name: s.name,
    printedTotal: s.printedTotal,
  }));

  console.log(
    `Catalog: ${Object.keys(gameCards).length} game cards, ${printings.length} printings across ${sets.length} sets`,
  );

  return { sets, cards: gameCards, printings };
}
