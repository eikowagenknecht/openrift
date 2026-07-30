import type { Marketplace, MarketplaceInfoResponse } from "@openrift/shared";
import { findStandardArtFallback, imageUrl, MARKETPLACE_LINKS, WellKnown } from "@openrift/shared";
import type { APIEmbed } from "discord.js";

import type { CatalogCard, CatalogPrinting, CatalogSnapshot, EnumLabels } from "./catalog-cache.js";

/** The brand green also used by the changelog webhook embeds. */
export const EMBED_COLOR = 0x24_70_5f;

/** Marketplaces in the order the site's price section shows them. */
const MARKETPLACE_ORDER: readonly Marketplace[] = ["tcgplayer", "cardmarket", "cardtrader"];

export interface CardEmbedInput {
  card: CatalogCard;
  printing: CatalogPrinting | undefined;
  snapshot: CatalogSnapshot;
  /** Per-marketplace product availability for the printing; optional so a failed lookup degrades to search links. */
  marketplaceInfo?: MarketplaceInfoResponse["infos"][string];
  siteUrl: string;
}

/**
 * Formats integer cents in the marketplace's currency, pinned to an English
 * locale so the output doesn't depend on the host machine.
 *
 * @returns The formatted amount, e.g. `$4.52`.
 */
export function formatCents(cents: number, currency: "USD" | "EUR"): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

/**
 * The compact stat line under the card name: super types + types, domains,
 * and whichever of energy/might/power the card has. The catalog stores enum
 * slugs; display labels come from the init endpoint's enum rows (bare lookups
 * — a missing label means a data bug and should surface, not be masked).
 *
 * @returns The description string for the embed.
 */
export function describeCard(card: CatalogCard, labels: EnumLabels): string {
  const typeLine = [
    ...card.superTypes.map((slug) => labels.superTypes[slug]),
    ...card.types.map((slug) => labels.cardTypes[slug]),
  ].join(" ");
  const parts = [typeLine];
  if (card.domains.length > 0) {
    parts.push(card.domains.map((slug) => labels.domains[slug]).join(" / "));
  }
  if (card.energy !== null) {
    parts.push(`Energy ${card.energy}`);
  }
  if (card.might !== null) {
    parts.push(`Might ${card.might}`);
  }
  if (card.power !== null) {
    parts.push(`Power ${card.power}`);
  }
  return parts.join(" · ");
}

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
 * @returns The difference tags, in the site's badge order.
 */
export function fallbackArtDifferences(
  printing: CatalogPrinting,
  artPrinting: CatalogPrinting,
  labels: EnumLabels,
): string[] {
  const tags: string[] = [];
  if (printing.language !== artPrinting.language) {
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
  return {
    imageId: fallback.image.imageId,
    fallbackNote:
      tags.length > 0
        ? `*Standard-printing artwork shown (differs: ${tags.join(", ")})*`
        : "*Standard-printing artwork shown*",
  };
}

/**
 * Builds the reply embed for a card: name linking to its OpenRift page, the
 * stat line, the front image, and one inline price field per marketplace that
 * has a price for the representative printing.
 *
 * @returns A plain APIEmbed ready to send.
 */
export function buildCardEmbed(input: CardEmbedInput): APIEmbed {
  const { card, printing, snapshot, siteUrl } = input;
  const { imageId, fallbackNote } = resolveEmbedArt(card, printing, snapshot);
  const set = printing ? snapshot.setsById.get(printing.setId) : undefined;
  const priceMap = printing ? snapshot.prices[printing.id] : undefined;

  const fields = MARKETPLACE_ORDER.flatMap((marketplace) => {
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

  const statLine = describeCard(card, snapshot.labels);
  return {
    title: card.name,
    url: `${siteUrl}/cards/${card.slug}`,
    description: fallbackNote ? `${statLine}\n${fallbackNote}` : statLine,
    color: EMBED_COLOR,
    ...(imageId ? { image: { url: `${siteUrl}${imageUrl(imageId, "full")}` } } : {}),
    ...(fields.length > 0 ? { fields } : {}),
    ...(printing
      ? { footer: { text: set ? `${printing.publicCode} · ${set.name}` : printing.publicCode } }
      : {}),
  };
}
