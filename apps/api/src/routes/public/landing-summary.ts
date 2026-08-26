import type { LandingSummaryResponse } from "@openrift/shared";
import { landingSummaryContract } from "@openrift/shared/contracts/landing-summary";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

// Cap the scatter at desktop's full deck (36 cards) — mobile uses fewer.
const THUMBNAIL_SAMPLE_SIZE = 36;

// What the promos vignette renders: two channel sections of two printings each.
const PROMO_SECTION_COUNT = 2;
const PROMO_PRINTINGS_PER_SECTION = 2;

const os = implement(landingSummaryContract).$context<ApiContext>().use(requireUser);

/**
 * Public landing-summary read.
 *
 * `GET /api/v1/landing-summary` — the lightweight hero payload: card count,
 * printing count, copy count, a per-day-stable sample of thumbnail ids for the
 * decorative card scatter, and the promo channels the marketing vignettes show.
 */
export const landingSummaryRouter = {
  get: os.get.handler(async ({ context }): Promise<LandingSummaryResponse> => {
    const { catalog } = context.repos;
    const [summary, promoSections] = await Promise.all([
      catalog.landingSummary(THUMBNAIL_SAMPLE_SIZE),
      catalog.landingPromoSections(PROMO_SECTION_COUNT, PROMO_PRINTINGS_PER_SECTION),
    ]);
    return {
      cardCount: summary.cardCount,
      printingCount: summary.printingCount,
      copyCount: summary.copyCount,
      thumbnailIds: summary.thumbnails.map((t) => t.imageId),
      thumbnails: summary.thumbnails,
      promoSections,
    };
  }),
};
