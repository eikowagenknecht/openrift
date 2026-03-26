import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useIsAdmin } from "@/hooks/use-admin";

export interface AdminSettings {
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
    { name: "admin-settings" },
  ),
);

// Returns admin settings if the user is an admin, otherwise null.
export function useAdminSettings(): AdminSettings | null {
  const { data: isAdmin } = useIsAdmin();
  const settings = useAdminSettingsStore((s) => s.settings);
  return isAdmin === true ? settings : null;
}
