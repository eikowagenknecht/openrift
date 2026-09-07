import type { TournamentHostType, TournamentStatus } from "@openrift/shared/types/api/tournament";

export interface DeckCheckHost {
  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;
}

/**
 * Deck-check treats an event as active for its whole pre-tournament and running
 * life. Decks are handed in *before* the tournament starts, so `setup` (the
 * state a wizard-created tournament sits in until round 1 is generated, which
 * never happens when OpenRift is used only for deck check) is a valid push
 * window. Only a finished (`completed`) or called-off (`cancelled`) event is
 * archived and refuses pushes.
 */
export function eventStatusForTournamentStatus(status: TournamentStatus): "active" | "archived" {
  return status === "completed" || status === "cancelled" ? "archived" : "active";
}
