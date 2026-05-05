import type { PackPrinting, Printing } from "@openrift/shared";

// Project a catalog Printing into the lean PackPrinting shape used by the opener.
export function toPackPrinting(p: Printing): PackPrinting {
  return {
    id: p.id,
    cardId: p.cardId,
    cardName: p.card.name,
    cardSlug: p.card.slug,
    cardType: p.card.type,
    cardSuperTypes: p.card.superTypes,
    rarity: p.rarity,
    finish: p.finish,
    artVariant: p.artVariant,
    isSigned: p.isSigned,
    language: p.language,
    shortCode: p.shortCode,
    publicCode: p.publicCode,
    setSlug: p.setSlug,
  };
}

// Booster-eligible: no markers (filters out promos, regionals, judge, etc.)
// and no "Other" type cards — the catalog stores buff cards (which are the
// printed backsides of other cards, not standalone pulls) under that type,
// so they'd otherwise show up as fake pulls in the pool.
export function isBoosterEligible(printing: Printing): boolean {
  return printing.markers.length === 0 && printing.card.type !== "other";
}
