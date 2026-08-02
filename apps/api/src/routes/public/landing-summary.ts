import type { LandingSummaryResponse } from "@openrift/shared";
import { landingSummaryContract } from "@openrift/shared/contracts/landing-summary";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

// Cap the scatter at desktop's full deck (36 cards) — mobile uses fewer.
const THUMBNAIL_SAMPLE_SIZE = 36;

const os = implement(landingSummaryContract).$context<ApiContext>().use(requireUser);

/**
 * Public landing-summary read.
 *
 * `GET /api/v1/landing-summary` — the lightweight hero payload: card count,
 * printing count, copy count, and a per-day-stable sample of thumbnail ids for
 * the decorative card scatter.
 */
export const landingSummaryRouter = {
  get: os.get.handler(async ({ context }): Promise<LandingSummaryResponse> => {
    const { catalog } = context.repos;
    const summary = await catalog.landingSummary(THUMBNAIL_SAMPLE_SIZE);
    return {
      cardCount: summary.cardCount,
      printingCount: summary.printingCount,
      copyCount: summary.copyCount,
      thumbnailIds: summary.thumbnailIds,
    };
  }),
};
