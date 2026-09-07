export const preferencesKeys = {
  all: (userId: string) => ["preferences", userId] as const,
} as const;

export const contactMethodsKeys = {
  all: (userId: string) => ["contact-methods", userId] as const,
} as const;
