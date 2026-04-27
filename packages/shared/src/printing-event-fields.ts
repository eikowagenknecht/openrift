// Display-friendly labels for the camelCase printing field names that show up
// in the printing_events change log (admin UI + Discord embeds).
const FIELD_LABELS: Readonly<Record<string, string>> = {
  artVariant: "Art variant",
  artist: "Artist",
  cardId: "Card",
  comment: "Comment",
  distributionChannelSlugs: "Distribution channels",
  finish: "Finish",
  flavorText: "Flavor text",
  imageUrl: "Image URL",
  isSigned: "Signed",
  language: "Language",
  markerSlugs: "Markers",
  printedEffectText: "Effect text",
  printedName: "Printed name",
  printedRulesText: "Rules text",
  promoTypeId: "Promo type",
  publicCode: "Public code",
  rarity: "Rarity",
  setId: "Set",
  shortCode: "Short code",
};

/**
 * Convert a camelCase printing field name into a sentence-cased label suitable
 * for showing to admins. Falls back to a generic camelCase split when the
 * field isn't in the lookup.
 *
 * @returns The display label for the given field.
 */
export function humanizePrintingField(field: string): string {
  const known = FIELD_LABELS[field];
  if (known !== undefined) {
    return known;
  }
  // Generic fallback: split on case boundaries, lowercase, then capitalize first.
  const spaced = field
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .trim();
  if (spaced.length === 0) {
    return field;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
