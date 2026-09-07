export const tournamentDecksKeys = {
  entry: (userId: string, tournamentId: string) =>
    ["tournament-decks", userId, tournamentId] as const,
  submission: (userId: string, token: string) =>
    ["tournament-decks", userId, "submission", token] as const,
  claim: (token: string) => ["tournament-decks", "claim", token] as const,
} as const;

export const podTournamentsKeys = {
  all: (userId: string) => ["pod-tournaments", userId] as const,
  detail: (userId: string, id: string) => ["pod-tournaments", userId, id] as const,
  report: (token: string) => ["pod-tournaments", "report", token] as const,
} as const;

export const tournamentsKeys = {
  all: (userId: string) => ["tournaments", userId] as const,
  detail: (userId: string, id: string) => ["tournaments", userId, id] as const,
  participants: (userId: string, id: string) =>
    ["tournaments", userId, id, "participants"] as const,
  staffCandidates: (userId: string, id: string) =>
    ["tournaments", userId, id, "staff-candidates"] as const,
  submitLanding: (token: string) => ["tournaments", "submit", token] as const,
  staffInviteLanding: (token: string) => ["tournaments", "staff-invite", token] as const,
  forGroup: (userId: string, slug: string) => ["tournaments", userId, "group", slug] as const,
} as const;

export const tournamentDeckCheckKeys = {
  entries: (userId: string, tournamentId: string) =>
    ["tournament-deck-check", userId, tournamentId] as const,
  entry: (userId: string, tournamentId: string, entryId: string) =>
    ["tournament-deck-check", userId, tournamentId, entryId] as const,
} as const;

export const deckCheckKeys = {
  mine: (userId: string) => ["deck-check-keys", userId, "me"] as const,
  org: (userId: string, orgId: string) => ["deck-check-keys", userId, "org", orgId] as const,
} as const;

export const organizationsKeys = {
  mine: (userId: string) => ["organizations", userId] as const,
  detail: (userId: string, id: string) => ["organizations", userId, id] as const,
  adminAll: ["admin", "organizations"] as const,
} as const;
