import { landingSummaryContract } from "@openrift/shared/contracts/landing-summary";
import type { LandingSummaryResponse } from "@openrift/shared/types/api/catalog";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const THUMBNAIL_SAMPLE_SIZE = 36;

const PROMO_SECTION_COUNT = 1;
const PROMO_PRINTINGS_PER_SECTION = 2;

const LEGEND_SAMPLE_SIZE = 10;

const os = implement(landingSummaryContract).$context<ApiContext>().use(requireUser);

/**
 * Public landing-summary read.
 *
 * `GET /api/v1/landing-summary` — the lightweight hero payload: card count,
 * printing count, copy count, a per-day-stable sample of thumbnail ids for the
 * decorative card scatter, a Legend-only sample for the tier-list vignette, and
 * the promo channels the marketing vignettes show.
 */
export const landingSummaryRouter = {
  get: os.get.handler(async ({ context }): Promise<LandingSummaryResponse> => {
    const { catalog } = context.repos;
    const [summary, legendThumbnailIds, promoSections] = await Promise.all([
      catalog.landingSummary(THUMBNAIL_SAMPLE_SIZE),
      catalog.landingLegendThumbnails(LEGEND_SAMPLE_SIZE),
      catalog.landingPromoSections(PROMO_SECTION_COUNT, PROMO_PRINTINGS_PER_SECTION),
    ]);
    return {
      cardCount: summary.cardCount,
      printingCount: summary.printingCount,
      copyCount: summary.copyCount,
      thumbnailIds: summary.thumbnails.map((t) => t.imageId),
      thumbnails: summary.thumbnails,
      legendThumbnailIds,
      promoSections,
    };
  }),
};
