import type { LandingSummaryResponse } from "@openrift/shared";
import { centsToDollars, imageUrl } from "@openrift/shared";

export interface LandingThumbnailCard {
  url: string;
  name: string;
  shortCode: string;
  variantLabel: string | null;
  rarity: string;
  domains: string[];
  /** Euros. */
  price: number | null;
}

/**
 * Identity fields are read defensively: the payload is edge-cached for up to
 * a day, so a bundle can be served a body that predates them.
 */
export function landingThumbnailCards(
  thumbnails: LandingSummaryResponse["thumbnails"] | undefined,
): LandingThumbnailCard[] {
  return (thumbnails ?? []).map((thumb) => ({
    url: imageUrl(thumb.imageId, "400w"),
    name: thumb.name ?? "",
    shortCode: thumb.shortCode ?? "",
    variantLabel: thumb.variantLabel ?? null,
    rarity: thumb.rarity ?? "",
    domains: thumb.domains ?? [],
    price: centsToDollars(thumb.priceCents ?? null),
  }));
}
