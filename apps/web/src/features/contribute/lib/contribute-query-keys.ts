export const cardSubmissionsKeys = {
  all: (userId: string) => ["card-submissions", userId] as const,
  missingImages: (userId: string) => ["card-submissions", userId, "missing-images"] as const,
  forCandidate: (candidateCardId: string) =>
    ["card-submissions", "candidate", candidateCardId] as const,
} as const;
