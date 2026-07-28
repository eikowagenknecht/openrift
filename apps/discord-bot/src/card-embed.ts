import type { Marketplace, MarketplaceInfoResponse } from "@openrift/shared";
import { imageUrl, MARKETPLACE_LINKS } from "@openrift/shared";
import type { APIEmbed } from "discord.js";

import type { CatalogCard, CatalogPrinting, CatalogSnapshot } from "./catalog-cache.js";

/** The brand green also used by the changelog webhook embeds. */
const EMBED_COLOR = 0x24_70_5f;

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
 * and whichever of energy/might/power the card has.
 *
 * @returns The description string for the embed.
 */
export function describeCard(card: CatalogCard): string {
  const typeLine = [...card.superTypes, ...card.types].join(" ");
  const parts = [typeLine];
  if (card.domains.length > 0) {
    parts.push(card.domains.join(" / "));
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
 * Builds the reply embed for a card: name linking to its OpenRift page, the
 * stat line, the front image, and one inline price field per marketplace that
 * has a price for the representative printing.
 *
 * @returns A plain APIEmbed ready to send.
 */
export function buildCardEmbed(input: CardEmbedInput): APIEmbed {
  const { card, printing, snapshot, siteUrl } = input;
  const frontImageId = printing?.images.find((image) => image.face === "front")?.imageId;
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

  return {
    title: card.name,
    url: `${siteUrl}/cards/${card.slug}`,
    description: describeCard(card),
    color: EMBED_COLOR,
    ...(frontImageId ? { image: { url: `${siteUrl}${imageUrl(frontImageId, "full")}` } } : {}),
    ...(fields.length > 0 ? { fields } : {}),
    ...(printing
      ? { footer: { text: set ? `${printing.publicCode} · ${set.name}` : printing.publicCode } }
      : {}),
  };
}
