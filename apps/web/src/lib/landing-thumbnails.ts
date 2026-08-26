import type { LandingSummaryResponse } from "@openrift/shared";
import { centsToDollars, imageUrl } from "@openrift/shared";

/**
 * One sampled printing from the landing summary, ready for a marketing
 * vignette: the art plus the identity of the card that art belongs to.
 */
export interface LandingThumbnailCard {
  url: string;
  name: string;
  shortCode: string;
  variantLabel: string | null;
  /** Cardmarket headline price in euros, or null when the printing has none. */
  price: number | null;
}

/**
 * Maps the landing-summary sample to per-card display data, in payload order so
 * the index slices the pages hand to each vignette stay aligned.
 *
 * Identity fields are read defensively: the payload is edge-cached for up to a
 * day, so a bundle can be served a body that predates them.
 * @returns One entry per sampled thumbnail.
 */
export function landingThumbnailCards(
  thumbnails: LandingSummaryResponse["thumbnails"] | undefined,
): LandingThumbnailCard[] {
  return (thumbnails ?? []).map((thumb) => ({
    url: imageUrl(thumb.imageId, "400w"),
    name: thumb.name ?? "",
    shortCode: thumb.shortCode ?? "",
    variantLabel: thumb.variantLabel ?? null,
    price: centsToDollars(thumb.priceCents ?? null),
  }));
}
