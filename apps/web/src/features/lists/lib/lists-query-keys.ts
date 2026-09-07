export const listsKeys = {
  all: (userId: string, intent?: string) =>
    intent === undefined
      ? (["lists", userId] as const)
      : (["lists", userId, "intent", intent] as const),
  detail: (userId: string, id: string) => ["lists", userId, id] as const,
  publicByToken: (token: string) => ["lists", "share", token] as const,
  groupShares: (userId: string, id: string) => ["lists", userId, id, "group-shares"] as const,
} as const;
