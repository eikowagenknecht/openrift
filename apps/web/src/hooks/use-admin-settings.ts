import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AdminSettings {
  debugOverlay: boolean;
}

interface AdminSettingsState {
  settings: AdminSettings;
  update: (patch: Partial<AdminSettings>) => void;
}

const useAdminSettingsStore = create<AdminSettingsState>()(
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

export function useAdminSettings() {
  const settings = useAdminSettingsStore((s) => s.settings);
  const update = useAdminSettingsStore((s) => s.update);
  return { settings, update };
}
