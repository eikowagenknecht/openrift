import { useLocalStorage } from "@/hooks/use-local-storage";

const ADMIN_SETTINGS_KEY = "admin-settings";

interface AdminSettings {
  debugOverlay: boolean;
}

const defaults: AdminSettings = {
  debugOverlay: false,
};

export function useAdminSettings() {
  const [settings, setSettings] = useLocalStorage<AdminSettings>(ADMIN_SETTINGS_KEY, defaults);

  const update = (patch: Partial<AdminSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  return { settings, update };
}
