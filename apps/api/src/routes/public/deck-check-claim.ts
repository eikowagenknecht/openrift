import type { DeckCheckClaimLandingResponse } from "@openrift/shared";
import { deckCheckClaimContract } from "@openrift/shared/contracts/deck-check-claim";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(deckCheckClaimContract).$context<ApiContext>().use(requireUser);

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
