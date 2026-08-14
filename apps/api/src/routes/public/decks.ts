import type { DeckExportResponse, PublicDeckDetailResponse } from "@openrift/shared";
import { publicDecksContract } from "@openrift/shared/contracts/public-decks";
import { implement } from "@orpc/server";

import { buildPublicDeckDetail } from "../../lib/public-deck-payload.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { encodeDeck } from "../../services/deck-codecs/encode-deck.js";

const os = implement(publicDecksContract).$context<ApiContext>().use(requireUser);

/**
 * Public shared-deck view. An unknown token returns a typed NOT_FOUND. Card +
 * preferred-printing data is denormalized so the share page can SSR without
 * the global catalog.
 */
export const publicDecksRouter = {
  share: os.share.handler(async ({ input, context, errors }): Promise<PublicDeckDetailResponse> => {
    const found = await context.repos.decks.findByShareToken(input.token);
    if (!found) {
      throw errors.NOT_FOUND({ message: "Not found" });
    }
    return buildPublicDeckDetail(context.repos, found);
  }),

  encode: os.encode.handler(({ input, context }): Promise<DeckExportResponse> => {
    const { canonicalPrintings } = context.repos;
    return encodeDeck(canonicalPrintings, input.cards, input.format ?? "piltover");
  }),
};
