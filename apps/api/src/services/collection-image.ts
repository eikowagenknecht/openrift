import type { Repos } from "../deps.js";
import type { Io } from "../io.js";
import type { ShareImageOptions } from "./share-image.js";
import { renderShareImage } from "./share-image.js";

/**
 * Prepares a collection into a share image (ADR-024), the way `list-image.ts`
 * does for a list. Shared by the public token-gated og:image route and the
 * owner's download route so the card cap, the count and the labels stay in one
 * place — the owner's download must show the same image the share link unfurls.
 */

/**
 * Per-printing rows resolved for a collection's share image. The grid only
 * draws a couple of dozen tiles, so this just bounds the art lookup; the
 * accurate "+N more" count comes from a separate distinct count, not this slice.
 */
const COLLECTION_SHARE_CARD_CAP = 60;

/** Everything needed to render one collection's share image. */
export interface CollectionImageData {
  collectionId: string;
  /** Public display name of the owner, shown next to the title. */
  ownerName: string;
  collectionName: string;
  /** Host shown in the footer (e.g. "openrift.app"); omitted when empty. */
  siteHost?: string;
  /** Absolute share URL for the QR; absent when the collection isn't shared. */
  shareUrl?: string;
  copies: Repos["copies"];
}

/**
 * Renders a collection's share image from its most-held printings. `scale`
 * renders the same layout at N× for the HQ download; `options` picks the canvas
 * and whether the mark carries a scannable code.
 * @returns PNG bytes ready to return as `image/png`.
 */
export async function renderCollectionImage(
  io: Io,
  data: CollectionImageData,
  scale = 1,
  options: ShareImageOptions = {},
): Promise<Buffer> {
  const { cards, totalDistinct } = await data.copies.collectionShareImageCards(
    data.collectionId,
    COLLECTION_SHARE_CARD_CAP,
  );
  return renderShareImage(
    io,
    {
      ownerName: data.ownerName,
      title: data.collectionName,
      intentLabel: "Collection",
      // Collections are printing-level (one tile per distinct printing).
      unit: { one: "printing", many: "printings" },
      cards,
      totalCount: totalDistinct,
      siteHost: data.siteHost,
      shareUrl: data.shareUrl,
    },
    scale,
    options,
  );
}
