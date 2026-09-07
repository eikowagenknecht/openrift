import type { Repos } from "../../../deps.js";
import type { ShareImageInput } from "../../system/services/share-image.js";

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

/** Runs the art lookup on the caller's thread; the result crosses to a render worker. */
export async function buildCollectionShareInput(
  data: CollectionImageData,
): Promise<ShareImageInput> {
  const { cards, totalDistinct } = await data.copies.collectionShareImageCards(
    data.collectionId,
    COLLECTION_SHARE_CARD_CAP,
  );
  return {
    ownerName: data.ownerName,
    title: data.collectionName,
    intentLabel: "Collection",
    unit: { one: "printing", many: "printings" },
    cards,
    totalCount: totalDistinct,
    siteHost: data.siteHost,
    shareUrl: data.shareUrl,
  };
}
