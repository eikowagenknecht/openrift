export const tierListsKeys = {
  all: (userId: string) => ["tier-lists", userId] as const,
  detail: (userId: string, id: string) => ["tier-lists", userId, id] as const,
  publicByToken: (token: string) => ["tier-lists", "share", token] as const,
} as const;

export const overlayKeys = {
  channel: (userId: string) => ["overlay", userId] as const,
  // The preset is part of the key: two browser sources on the same token but
  // different presets must not share a cache slot.
  stateByToken: (token: string, presetId?: string) =>
    ["overlay", "state", token, presetId ?? null] as const,
} as const;

export const stagePresetsKeys = {
  all: (userId: string) => ["stage-presets", userId] as const,
} as const;
