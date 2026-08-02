import { adminCardQueriesContract } from "@openrift/shared/contracts/admin/card-queries";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import {
  buildCandidateCardList,
  buildCardDetail,
  buildExport,
  buildUnmatchedDetail,
} from "../../../services/candidate-queries.js";
import { reviewableProviderScope } from "../../../services/card-review-scope.js";

const os = implement(adminCardQueriesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Read-only admin card queries. `providerStats` coerces the `lastUpdated`
 * timestamp (a native `Date` from the driver, despite its `sql<string>` type)
 * to an ISO string for the `z.string()` output schema, and `getCandidateCard`
 * may throw `AppError` (missing alias) which is mapped by the handler's
 * appErrorInterceptor.
 */
export const adminCardQueriesRouter = {
  allCards: os.allCards.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    return await candidateCards.listAllCards();
  }),

  providerNames: os.providerNames.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    return await candidateCards.distinctProviderNames();
  }),

  distinctArtists: os.distinctArtists.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    return await candidateCards.distinctArtists();
  }),

  providerStats: os.providerStats.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    const stats = await candidateCards.providerStats();
    return stats.map((s) => ({ ...s, lastUpdated: new Date(s.lastUpdated).toISOString() }));
  }),

  listCandidates: os.listCandidates.handler(async ({ context }) => {
    const { candidateCards, providerSettings } = context.repos;
    const favoriteProviders = await providerSettings.favoriteProviders();
    const scope = await reviewableProviderScope(context.adminAccess, providerSettings);
    return await buildCandidateCardList(candidateCards, favoriteProviders, scope);
  }),

  exportCandidates: os.exportCandidates.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    return await buildExport(candidateCards);
  }),

  getCandidateCard: os.getCandidateCard.handler(async ({ input, context }) => {
    const { candidateCards, marketplaceMapping, providerSettings } = context.repos;
    const scope = await reviewableProviderScope(context.adminAccess, providerSettings);
    return await buildCardDetail(candidateCards, marketplaceMapping, input.cardSlug, scope);
  }),

  getUnmatchedDetail: os.getUnmatchedDetail.handler(async ({ input, context }) => {
    const { candidateCards, providerSettings } = context.repos;
    const scope = await reviewableProviderScope(context.adminAccess, providerSettings);
    return await buildUnmatchedDetail(candidateCards, input.name, scope);
  }),
};
