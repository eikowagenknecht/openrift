import type { PackPrinting, Printing } from "@openrift/shared";

// Project a catalog Printing into the lean PackPrinting shape used by the opener.
export function toPackPrinting(p: Printing): PackPrinting {
  return {
    id: p.id,
    cardId: p.cardId,
    cardName: p.card.name,
    cardSlug: p.card.slug,
    cardType: p.card.type,
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

// Booster-eligible: no markers (filters out promos, regionals, judge, etc.).
export function isBoosterEligible(printing: Printing): boolean {
  return printing.markers.length === 0;
}
