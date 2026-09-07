import type { PackPrinting, Printing } from "@openrift/shared";

export function toPackPrinting(p: Printing): PackPrinting {
  return {
    id: p.id,
    cardId: p.cardId,
    cardName: p.card.name,
    cardSlug: p.card.slug,
    cardTypes: p.card.types,
    cardSuperTypes: p.card.superTypes,
    tags: p.card.tags,
    rarity: p.rarity,
    finish: p.finish,
    artVariant: p.artVariant,
    isSigned: p.isSigned,
    isOvernumbered: p.isOvernumbered,
    language: p.language,
    shortCode: p.shortCode,
    publicCode: p.publicCode,
    setSlug: p.setSlug,
  };
}

// "Other"-typed printings are buff-card backsides, not standalone pulls, and are excluded.
export function isBoosterEligible(printing: Printing): boolean {
  return printing.markers.length === 0 && !printing.card.types.includes("other");
}
