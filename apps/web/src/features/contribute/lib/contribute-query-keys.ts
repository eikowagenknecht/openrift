export const cardSubmissionsKeys = {
  all: (userId: string) => ["card-submissions", userId] as const,
  forCandidate: (candidateCardId: string) =>
    ["card-submissions", "candidate", candidateCardId] as const,
} as const;
