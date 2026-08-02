import type { DeckCheckClaimLandingResponse } from "@openrift/shared";
import { deckCheckClaimContract } from "@openrift/shared/contracts/deck-check-claim";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(deckCheckClaimContract).$context<ApiContext>().use(requireUser);

/**
 * The public tournament claim landing (ADR-033): resolves a participant claim
 * token to the tournament, its owning group (if any), and the spot's name.
 * Works with or without deck check. An unknown token returns a typed NOT_FOUND.
 */
export const deckCheckClaimRouter = {
  landing: os.landing.handler(
    async ({ input, context, errors }): Promise<DeckCheckClaimLandingResponse> => {
      const landing = await context.repos.tournaments.getClaimLandingByToken(input.token);
      if (!landing) {
        throw errors.NOT_FOUND({ message: "Claim link not found" });
      }
      return { ...landing, startsAt: landing.startsAt.toISOString() };
    },
  ),
};
