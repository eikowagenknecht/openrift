import { imageUrl } from "@openrift/shared/image-url";
import { MARKETPLACE_LINKS } from "@openrift/shared/marketplace";
import { findStandardArtFallback } from "@openrift/shared/standard";
import type { MarketplaceInfoResponse } from "@openrift/shared/types/api/pricing";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { formatCents, legendDisplayName, truncateWithEllipsis } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import type { APIEmbed, APIEmbedField } from "discord.js";

import { formatCardText } from "./card-text.js";
import type { CatalogCard, CatalogPrinting, CatalogSnapshot, EnumLabels } from "./catalog-cache.js";
import type { GlyphEmojis } from "./glyph-emoji.js";
import type { TradelistHolderPrinting, TradelistHolders } from "./group-tradelists.js";
import { printingVariantParts } from "./printing-choice.js";

export const EMBED_COLOR = 0x24_70_5f;

const MARKETPLACE_ORDER: readonly Marketplace[] = ["tcgplayer", "cardmarket", "cardtrader"];

/** Discord's per-field value cap. */
export const FIELD_LIMIT = 1024;

export interface CardEmbedInput {
  card: CatalogCard;
  printing: CatalogPrinting | undefined;
  snapshot: CatalogSnapshot;
  marketplaceInfo?: MarketplaceInfoResponse["infos"][string];
  siteUrl: string;
  tradelists?: TradelistHolders | null;
}

const MAX_TRADELIST_HOLDERS = 5;

const MAX_TRADELIST_PRINTINGS = 5;

/**
 * Printings run in the card's canonical order (the order the site and the
 * /card autocomplete use); a public code repeated from the previous entry is
 * dropped, so a card's prints read as `OGN-202 Standard 1× · Alt art 1×`.
 */
function printingBreakdown(
  printings: TradelistHolderPrinting[],
  snapshot: CatalogSnapshot,
  card: CatalogCard,
): string | null {
  if (printings.length === 0) {
    return null;
  }
  const siblings = snapshot.printingsByCardId.get(card.id) ?? [];
  const byId = new Map(siblings.map((printing) => [printing.id, printing]));
  const rank = new Map(siblings.map((printing, index) => [printing.id, index]));
  // A printing the cached catalog hasn't seen yet sorts last, not dropped.
  const ordered = printings.toSorted(
    (first, second) =>
      (rank.get(first.printingId) ?? siblings.length) -
      (rank.get(second.printingId) ?? siblings.length),
  );
  const shown = ordered.slice(0, MAX_TRADELIST_PRINTINGS);
  let previousCode: string | null = null;
  const parts = shown.map((entry) => {
    const printing = byId.get(entry.printingId);
    let label = "Unknown printing";
    if (printing) {
      const variant = printingVariantParts(snapshot, printing, siblings);
      const code = printing.publicCode === previousCode ? null : printing.publicCode;
      label = [code, ...variant].filter((part) => part !== null).join(" ") || printing.publicCode;
      previousCode = printing.publicCode;
    }
    const lists = entry.listNames.length > 0 ? ` (${entry.listNames.join(", ")})` : "";
    return `${label} ${entry.quantity}×${lists}`;
  });
  const hidden = ordered.length - shown.length;
  if (hidden > 0) {
    parts.push(`+${hidden} more`);
  }
  return `-# ${parts.join(" · ")}`;
}

/** Display names, per-printing counts and list names only; the API already projects away conditions, notes, and prices. */
function tradelistField(
  tradelists: TradelistHolders | null | undefined,
  snapshot: CatalogSnapshot,
  card: CatalogCard,
): APIEmbedField | null {
  if (!tradelists || tradelists.holders.length === 0) {
    return null;
  }
  const shown = tradelists.holders.slice(0, MAX_TRADELIST_HOLDERS);
  const lines = shown.flatMap((holder) => {
    const breakdown = printingBreakdown(holder.printings, snapshot, card);
    const header = `${holder.userName ?? "Unknown user"} · ${holder.quantity}×`;
    return breakdown ? [header, breakdown] : [header];
  });
  const hidden = tradelists.holders.length - shown.length;
  if (hidden > 0) {
    lines.push(`…and ${hidden} more`);
  }
  return {
    name: tradelists.groupName ? `On tradelists in ${tradelists.groupName}` : "On tradelists",
    value: truncateWithEllipsis(lines.join("\n"), FIELD_LIMIT),
  };
}

function priceLink(
  marketplace: Marketplace,
  card: CatalogCard,
  printing: CatalogPrinting | undefined,
  info: CardEmbedInput["marketplaceInfo"],
): string {
  const productId = info?.[marketplace]?.productId;
  if (info?.[marketplace]?.available && typeof productId === "number") {
    return MARKETPLACE_LINKS[marketplace].productUrl(productId, printing?.language);
  }
  return MARKETPLACE_LINKS[marketplace].searchUrl(card.name);
}

/** Mirrors the site's `FallbackArtBadges`; a pinned substitute has no printing behind it, so `artPrinting` is null. */
export function fallbackArtDifferences(
  printing: CatalogPrinting,
  artPrinting: CatalogPrinting | null,
  labels: EnumLabels,
): string[] {
  const tags: string[] = [];
  if (artPrinting !== null && printing.language !== artPrinting.language) {
    tags.push(artPrinting.language);
  }
  for (const marker of printing.markers) {
    tags.push(marker.label);
  }
  const artVariant = printing.artVariant || WellKnown.artVariant.NORMAL;
  const artVariantLabel = labels.artVariants[artVariant];
  if (artVariant !== WellKnown.artVariant.NORMAL && artVariantLabel !== undefined) {
    tags.push(artVariantLabel);
  }
  if (printing.isOvernumbered) {
    tags.push("Overnumbered");
  }
  if (printing.isSigned) {
    tags.push("Signed");
  }
  const finishLabel = labels.finishes[printing.finish];
  if (
    (printing.finish === WellKnown.finish.METAL ||
      printing.finish === WellKnown.finish.METAL_DELUXE) &&
    finishLabel !== undefined
  ) {
    tags.push(finishLabel);
  }
  return tags;
}

/** Like the site's card browser, falls back to the standard printing's artwork (same language, else EN) when there's none of its own. */
function resolveEmbedArt(
  card: CatalogCard,
  printing: CatalogPrinting | undefined,
  snapshot: CatalogSnapshot,
): { imageId?: string; fallbackNote?: string } {
  const ownImage = printing?.images.find((image) => image.face === "front");
  if (!printing || ownImage) {
    return { imageId: ownImage?.imageId };
  }
  const fallback = findStandardArtFallback(printing, snapshot.printingsByCardId.get(card.id) ?? []);
  if (!fallback) {
    return {};
  }
  const tags = fallbackArtDifferences(printing, fallback.printing, snapshot.labels);
  // A pinned substitute can be any artwork an admin chose, so only the
  // derived case may claim the art comes from the standard printing.
  const source =
    printing.fallbackArtMode === "pinned" ? "Substitute artwork" : "Standard-printing artwork";
  return {
    imageId: fallback.image.imageId,
    fallbackNote:
      tags.length > 0 ? `*${source} shown (differs: ${tags.join(", ")})*` : `*${source} shown*`,
  };
}

export function printingFooter(printing: CatalogPrinting, snapshot: CatalogSnapshot): string {
  const set = snapshot.setsById.get(printing.setId);
  const siblings = snapshot.printingsByCardId.get(printing.cardId) ?? [];
  const parts = [printing.publicCode];
  if (set) {
    parts.push(set.name);
  }
  parts.push(...printingVariantParts(snapshot, printing, siblings));
  return parts.join(" · ");
}

/** Mirrors the site's `ErrataNotice` header. */
function errataCredit(errata: NonNullable<CatalogCard["errata"]>): string {
  const label = errata.effectiveDate
    ? `${errata.source}, ${errata.effectiveDate.slice(0, 7)}`
    : errata.source;
  return errata.sourceUrl ? `[${label}](${errata.sourceUrl})` : label;
}

/** Original printed text stays off the embed; it lives behind a disclosure on the site, and the embed has no disclosures. */
function errataNote(errata: NonNullable<CatalogCard["errata"]>): string {
  return `*Errata (${errataCredit(errata)})*`;
}

/** The two things the artwork can't tell you: the card is banned somewhere, or its printed text is erratated. */
export function cardWarnings(card: CatalogCard): string[] {
  const lines: string[] = [];
  if (card.bans.length > 0) {
    lines.push(`🚫 **Banned** in ${card.bans.map((ban) => ban.formatName).join(", ")}`);
  }
  if (card.errata) {
    lines.push(`⚠️ **Errata** (${errataCredit(card.errata)})`);
  }
  return lines;
}

/**
 * Errata replace the printed rules and effect text, as on the site, with a
 * credit line when they differ. Flavor text is not included; it's on the artwork.
 */
export function cardTextFields(
  card: CatalogCard,
  printing: CatalogPrinting | undefined,
  emojis: GlyphEmojis,
): APIEmbedField[] {
  const fields: APIEmbedField[] = [];
  const { errata } = card;

  const rulesText = errata?.correctedRulesText ?? printing?.printedRulesText;
  if (rulesText) {
    const corrected =
      Boolean(errata?.correctedRulesText) && rulesText !== printing?.printedRulesText;
    const value = [
      formatCardText(rulesText, emojis),
      ...(corrected && errata ? [errataNote(errata)] : []),
    ].join("\n");
    fields.push({ name: "Rules text", value: truncateWithEllipsis(value, FIELD_LIMIT) });
  }

  const effectText = errata?.correctedEffectText ?? printing?.printedEffectText;
  const mightBonus = card.mightBonus !== null && card.mightBonus > 0 ? card.mightBonus : null;
  if (effectText || mightBonus !== null) {
    const corrected =
      Boolean(errata?.correctedEffectText) && effectText !== printing?.printedEffectText;
    const value = [
      ...(effectText ? [formatCardText(effectText, emojis)] : []),
      ...(corrected && errata ? [errataNote(errata)] : []),
      ...(mightBonus === null ? [] : [`**Might bonus** +${mightBonus}`]),
    ].join("\n");
    fields.push({ name: "Effect text", value: truncateWithEllipsis(value, FIELD_LIMIT) });
  }

  return fields;
}

/** The stat line and card text stay off the reply; they live behind the Details button (see `buildCardDetailsEmbed`). */
export function buildCardEmbed(input: CardEmbedInput): APIEmbed {
  const { card, printing, snapshot, siteUrl } = input;
  const { imageId, fallbackNote } = resolveEmbedArt(card, printing, snapshot);
  const priceMap = printing ? snapshot.prices[printing.id] : undefined;

  const priceFields = MARKETPLACE_ORDER.flatMap((marketplace) => {
    const cents = priceMap?.[marketplace];
    if (cents === undefined) {
      return [];
    }
    const amount = formatCents(cents, snapshot.currencies[marketplace]);
    const link = priceLink(marketplace, card, printing, input.marketplaceInfo);
    return [
      {
        name: MARKETPLACE_LINKS[marketplace].label,
        value: `[${amount}](${link})`,
        inline: true,
      },
    ];
  });

  // Tradelists first, then the prices: the price fields are inline, so they
  // pack into one row under the full-width holders block.
  const holdersField = tradelistField(input.tradelists, snapshot, card);
  const fields = [...(holdersField ? [holdersField] : []), ...priceFields];

  const lines = [...cardWarnings(card), ...(fallbackNote ? [fallbackNote] : [])];
  return {
    title: legendDisplayName(card),
    url: `${siteUrl}/cards/${card.slug}`,
    ...(lines.length > 0 ? { description: lines.join("\n") } : {}),
    color: EMBED_COLOR,
    ...(imageId ? { image: { url: `${siteUrl}${imageUrl(imageId, "full")}` } } : {}),
    ...(fields.length > 0 ? { fields } : {}),
    ...(printing ? { footer: { text: printingFooter(printing, snapshot) } } : {}),
  };
}
