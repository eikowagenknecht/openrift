import type { Marketplace, MarketplaceInfoResponse } from "@openrift/shared";
import {
  findStandardArtFallback,
  formatCents,
  imageUrl,
  legendDisplayName,
  MARKETPLACE_LINKS,
  truncateWithEllipsis,
  WellKnown,
} from "@openrift/shared";
import type { APIEmbed, APIEmbedField } from "discord.js";

import { formatCardText } from "./card-text.js";
import type { CatalogCard, CatalogPrinting, CatalogSnapshot, EnumLabels } from "./catalog-cache.js";
import type { GlyphEmojis } from "./glyph-emoji.js";
import type { TradelistHolderPrinting, TradelistHolders } from "./group-tradelists.js";
import { printingVariantParts } from "./printing-choice.js";

/** The brand green also used by the changelog webhook embeds. */
export const EMBED_COLOR = 0x24_70_5f;

/** Marketplaces in the order the site's price section shows them. */
const MARKETPLACE_ORDER: readonly Marketplace[] = ["tcgplayer", "cardmarket", "cardtrader"];

/** Discord's per-field value cap. */
export const FIELD_LIMIT = 1024;

export interface CardEmbedInput {
  card: CatalogCard;
  printing: CatalogPrinting | undefined;
  snapshot: CatalogSnapshot;
  /** Per-marketplace product availability for the printing; optional so a failed lookup degrades to search links. */
  marketplaceInfo?: MarketplaceInfoResponse["infos"][string];
  siteUrl: string;
  /** Members of the guild's linked group offering the card on a shared tradelist. */
  tradelists?: TradelistHolders | null;
}

/** Holders named per embed field before collapsing into "…and N more". */
const MAX_TRADELIST_HOLDERS = 5;

/** Printings named per holder before collapsing into "+N more". */
const MAX_TRADELIST_PRINTINGS = 5;

/**
 * The breakdown line under one holder: which printings the copies are, how
 * many of each, and the shared lists they sit on. Printings run in the card's
 * canonical order (the order the site and the /card autocomplete use), and a
 * public code repeated from the previous entry is dropped, so a card's
 * standard and alt art prints read as `OGN-202 Standard 1× · Alt art 1×`.
 *
 * @returns The subtext line, or null when there is nothing to break down.
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
  // A printing the cached catalog hasn't seen yet sorts last rather than
  // dropping out — the count is still real supply.
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

/**
 * The "who has this on a tradelist" field for a card mentioned in a linked
 * guild. Display names, per-printing counts and list names only — the API
 * already projects away everything else (conditions, notes, prices).
 *
 * @returns The embed field, or null when there is nothing to show.
 */
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

/**
 * Formats integer cents in the marketplace's currency, pinned to an English
 * locale so the output doesn't depend on the host machine.
 *
 * @returns The formatted amount, e.g. `$4.52`.
 */

/**
 * Builds the marketplace link for one price field: the product page (with the
 * affiliate tag where the marketplace has one) when a product mapping exists,
 * otherwise a marketplace search for the card name.
 *
 * @returns The URL to attach to the price.
 */
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

/**
 * The properties the requested printing has that substitute artwork doesn't,
 * mirroring the site's `FallbackArtBadges`: the art's language when it
 * differs, each marker, a non-normal art variant, a signature, and a metal
 * finish.
 *
 * Art an admin pinned from outside the catalogue has no printing behind it, so
 * `artPrinting` is null and the language tag drops out. The rest still apply:
 * they describe the printing that was asked for, not the art standing in.
 *
 * @returns The difference tags, in the site's badge order.
 */
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
  if (artVariant !== WellKnown.artVariant.NORMAL) {
    tags.push(labels.artVariants[artVariant]);
  }
  if (printing.isSigned) {
    tags.push("Signed");
  }
  if (
    printing.finish === WellKnown.finish.METAL ||
    printing.finish === WellKnown.finish.METAL_DELUXE
  ) {
    tags.push(labels.finishes[printing.finish]);
  }
  return tags;
}

/**
 * Picks the embed image for a printing: its own front image, or — like the
 * site's card browser — the standard printing's artwork (same language, else
 * EN) when the printing has no image of its own, with the differences noted.
 *
 * @returns The image id to show (undefined when nothing has an image) and the
 * fallback note for the description (undefined when no substitution happened).
 */
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
  // A pinned substitute can be any artwork an admin chose, so only the derived
  // case may claim the art comes from the standard printing.
  const source =
    printing.fallbackArtMode === "pinned" ? "Substitute artwork" : "Standard-printing artwork";
  return {
    imageId: fallback.image.imageId,
    fallbackNote:
      tags.length > 0 ? `*${source} shown (differs: ${tags.join(", ")})*` : `*${source} shown*`,
  };
}

/**
 * The embed footer for a printing: public code, set name, and the variant
 * attributes that tell it from the card's other printings, so the reply says
 * which of several same-code printings it is showing.
 *
 * @returns The footer text.
 */
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

/**
 * The errata's source and effective month, mirroring the site's `ErrataNotice`
 * header and linked when the errata has a source URL.
 *
 * @returns The credit, without surrounding markup.
 */
function errataCredit(errata: NonNullable<CatalogCard["errata"]>): string {
  const label = errata.effectiveDate
    ? `${errata.source}, ${errata.effectiveDate.slice(0, 7)}`
    : errata.source;
  return errata.sourceUrl ? `[${label}](${errata.sourceUrl})` : label;
}

/**
 * The one-line errata credit under a corrected text block. The original
 * printed text stays off the embed — it lives behind a disclosure on the site,
 * and the embed has no disclosures.
 *
 * @returns The credit line.
 */
function errataNote(errata: NonNullable<CatalogCard["errata"]>): string {
  return `*Errata (${errataCredit(errata)})*`;
}

/**
 * The lines that have to stay above the fold, because they are the two things
 * the artwork cannot tell you: the card is banned somewhere, or its printed
 * text has been erratated and the image is therefore wrong. Everything else
 * about a card is legible on the image itself and lives behind the Details
 * button.
 *
 * @returns Zero to two description lines.
 */
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
 * The card's text blocks, in the order the site's card panel stacks them:
 * rules text, then effect text (with the might bonus that shares its box).
 * Errata replace the printed rules and effect text, as on the site, with a
 * credit line when they differ from what was printed. Flavor text is not
 * included — it is printed on the artwork and never decides anything.
 *
 * @returns Zero to two full-width embed fields.
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

/**
 * Builds the reply embed for a card: name linking to its OpenRift page, the
 * front image, and one inline price field per marketplace that has a price for
 * the representative printing. The stat line and the card's text are not here
 * — they are printed on the artwork, so they live behind the Details button
 * (see `buildCardDetailsEmbed`) and the reply stays one screenful. Only what
 * the image cannot say stays above the fold: bans, errata, and the note that a
 * substitute artwork is being shown.
 *
 * @returns A plain APIEmbed ready to send.
 */
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
