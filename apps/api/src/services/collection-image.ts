import type { Repos } from "../deps.js";
import type { Io } from "../io.js";
import type { ShareImageOptions } from "./share-image.js";
import { renderShareImage } from "./share-image.js";

/**
 * Shared by the public token-gated og:image route and the owner's download
 * route so the owner's download shows the same image the share link unfurls.
 */

/** Only bounds the art lookup; the "+N more" count comes from a separate distinct count, not this slice. */
const COLLECTION_SHARE_CARD_CAP = 60;

export interface CollectionImageData {
  collectionId: string;
  ownerName: string;
  collectionName: string;
  siteHost?: string;
  shareUrl?: string;
  copies: Repos["copies"];
}

/**
 * `scale` renders the same layout at N× for the HQ download; `options`
 * picks the canvas and whether the mark carries a scannable code.
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
