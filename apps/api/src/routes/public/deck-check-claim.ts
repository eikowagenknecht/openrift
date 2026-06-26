import type { DeckCheckClaimLandingResponse } from "@openrift/shared";
import { deckCheckClaimContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(deckCheckClaimContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the public deck-check claim landing. Logic unchanged
 * from the previous handler; the unknown-token 404 is a typed NOT_FOUND.
 */
export const deckCheckClaimRouter = {
  landing: os.landing.handler(
    async ({ input, context, errors }): Promise<DeckCheckClaimLandingResponse> => {
      const landing = await context.repos.deckCheck.getClaimLandingByToken(input.token);
      if (!landing) {
        throw errors.NOT_FOUND({ message: "Claim link not found" });
      }
      return landing;
    },
  ),
};
