export const rulesKeys = {
  all: (kind: string) => ["rules", kind] as const,
  versions: (kind: string) => ["rules", kind, "versions"] as const,
  byVersion: (kind: string, version: string) => ["rules", kind, version] as const,
} as const;
