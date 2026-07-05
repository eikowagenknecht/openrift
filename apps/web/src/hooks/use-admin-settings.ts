import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useIsAdmin } from "@/hooks/use-admin";

interface AdminSettings {
  debugOverlay: boolean;
}

interface AdminSettingsState {
  settings: AdminSettings;
  update: (patch: Partial<AdminSettings>) => void;
}

export const useAdminSettingsStore = create<AdminSettingsState>()(
  persist(
    (set) => ({
      settings: { debugOverlay: false },
      update: (patch) =>
        set((state) => ({
          settings: { ...state.settings, ...patch },
        })),
    }),
    {
      name: "admin-settings",
      // Validate on rehydrate: keep only known boolean fields from the blob.
      merge: (persisted, current) => {
        const raw =
          persisted && typeof persisted === "object"
            ? (persisted as { settings?: Record<string, unknown> }).settings
            : undefined;
        return {
          ...current,
          settings: {
            debugOverlay: typeof raw?.debugOverlay === "boolean" ? raw.debugOverlay : false,
          },
        };
      },
    },
  ),
);

/**
 * Returns admin settings if the user is an admin, otherwise null.
 * @returns Admin settings or null for non-admins.
 */
export function useAdminSettings(): AdminSettings | null {
  const { data: isAdmin } = useIsAdmin();
  const settings = useAdminSettingsStore((s) => s.settings);
  return isAdmin === true ? settings : null;
}
