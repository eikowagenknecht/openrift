import { normalizeNameForMatching } from "@openrift/shared/utils";
import type { Kysely } from "kysely";

import type { Database } from "../../db/types.js";
import type { ReferenceData } from "./types.js";

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
  const [sets, cards, printings] = await Promise.all([
    db.selectFrom("sets").select(["id", "name"]).execute(),
    db.selectFrom("cards").select(["id", "name"]).execute(),
    db
      .selectFrom("printings")
      .select([
        "id",
        "card_id",
        "set_id",
        "source_id",
        "public_code",
        "finish",
        "art_variant",
        "is_signed",
      ])
      .execute(),
  ]);

  const setNameById = new Map(sets.map((s) => [s.id, s.name]));
  const cardNameById = new Map(cards.map((c) => [c.id, c.name]));

  // namesBySet: set_id -> Map<lowercaseName, card_id>
  const namesBySet = new Map<string, Map<string, string>>();
  for (const p of printings) {
    let setMap = namesBySet.get(p.set_id);
    if (!setMap) {
      setMap = new Map();
      namesBySet.set(p.set_id, setMap);
    }
    const name = cardNameById.get(p.card_id);
    if (name) {
      const key = normalizeNameForMatching(name);
      if (!setMap.has(key)) {
        setMap.set(key, p.card_id);
      }
    }
  }

  // printingsByCardSetFinish: "card_id|set_id|finish" -> printing_id[]
  const printingsByCardSetFinish = new Map<string, string[]>();
  // printingByFullKey: "card_id|set_id|finish|art_variant|is_signed" -> printing_id
  const printingByFullKey = new Map<string, string>();
  for (const p of printings) {
    const key = `${p.card_id}|${p.set_id}|${p.finish}`;
    let arr = printingsByCardSetFinish.get(key);
    if (!arr) {
      arr = [];
      printingsByCardSetFinish.set(key, arr);
    }
    arr.push(p.id);

    const fullKey = `${key}|${p.art_variant}|${p.is_signed}`;
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
