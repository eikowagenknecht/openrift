import { normalizeNameForMatching } from "@openrift/shared/utils";
import type { Kysely } from "kysely";

import type { Database } from "../../db/types.js";
import { priceRefreshRepo } from "../../repositories/price-refresh.js";

interface ReferenceData {
  sets: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  printings: {
    id: string;
    cardId: string;
    setId: string;
    shortCode: string;
    publicCode: string;
    finish: string;
    artVariant: string;
    isSigned: boolean;
  }[];
  setNameById: Map<string, string>;
  cardNameById: Map<string, string>;
  namesBySet: Map<string, Map<string, string>>;
  printingsByCardSetFinish: Map<string, string[]>;
  printingByFullKey: Map<string, string>;
}

/**
 * Load sets, cards, and printings from the DB and build lookup maps used by
 * price refresh scripts to match external products to internal printings.
 *
 * Returned maps:
 * - `setNameById` / `cardNameById` — display-name lookups.
 * - `namesBySet` — per-set map of normalized card name -> card_id (for fuzzy matching).
 * - `printingsByCardSetFinish` — `"card_id|set_id|finish"` -> printing_id[] (coarse match).
 * - `printingByFullKey` — `"card_id|set_id|finish|art_variant|is_signed"` -> single printing_id.
 * @returns Raw rows and pre-built lookup maps.
 */
export async function loadReferenceData(db: Kysely<Database>): Promise<ReferenceData> {
  const repo = priceRefreshRepo(db);

  const [sets, cards, printings] = await Promise.all([
    repo.allSets(),
    repo.allCards(),
    repo.allPrintingsForPriceMatch(),
  ]);

  const setNameById = new Map(sets.map((s) => [s.id, s.name]));
  const cardNameById = new Map(cards.map((c) => [c.id, c.name]));

  // namesBySet: setId -> Map<lowercaseName, cardId>
  const namesBySet = new Map<string, Map<string, string>>();
  for (const p of printings) {
    let setMap = namesBySet.get(p.setId);
    if (!setMap) {
      setMap = new Map();
      namesBySet.set(p.setId, setMap);
    }
    const name = cardNameById.get(p.cardId);
    if (name) {
      const key = normalizeNameForMatching(name);
      if (!setMap.has(key)) {
        setMap.set(key, p.cardId);
      }
    }
  }

  // printingsByCardSetFinish: "cardId|setId|finish" -> printingId[]
  const printingsByCardSetFinish = new Map<string, string[]>();
  // printingByFullKey: "cardId|setId|finish|artVariant|isSigned" -> printingId
  const printingByFullKey = new Map<string, string>();
  for (const p of printings) {
    const key = `${p.cardId}|${p.setId}|${p.finish}`;
    let arr = printingsByCardSetFinish.get(key);
    if (!arr) {
      arr = [];
      printingsByCardSetFinish.set(key, arr);
    }
    arr.push(p.id);

    const fullKey = `${key}|${p.artVariant}|${p.isSigned}`;
    printingByFullKey.set(fullKey, p.id);
  }

  return {
    sets,
    cards,
    printings,
    setNameById,
    cardNameById,
    namesBySet,
    printingsByCardSetFinish,
    printingByFullKey,
  };
}
