import { adminCardMutationsCandidatesRouter } from "./admin-cards-mutations-candidates.js";
import { adminCardMutationsCardsRouter } from "./admin-cards-mutations-cards.js";
import { adminCardMutationsErrataRouter } from "./admin-cards-mutations-errata.js";
import { adminCardMutationsPrintingsRouter } from "./admin-cards-mutations-printings.js";

export const adminCardMutationsRouter = {
  ...adminCardMutationsCandidatesRouter,
  ...adminCardMutationsCardsRouter,
  ...adminCardMutationsPrintingsRouter,
  ...adminCardMutationsErrataRouter,
};
