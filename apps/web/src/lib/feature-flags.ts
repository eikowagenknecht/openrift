export const featureFlags = {
  auth: import.meta.env.VITE_FEATURE_AUTH === "true",
} as const;
