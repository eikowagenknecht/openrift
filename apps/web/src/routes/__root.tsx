import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useMatch } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { createContext, lazy, useContext } from "react";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { ReloadPrompt } from "@/components/pwa/reload-prompt";
import { Toaster } from "@/components/ui/sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { SWUpdateProvider } from "@/hooks/use-sw-update";
import { useTheme } from "@/hooks/use-theme";
import type { CardFields } from "@/lib/card-fields";
import { DEFAULT_CARD_FIELDS } from "@/lib/card-fields";

const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null
  : lazy(async () => {
      const mod = await import("@tanstack/react-router-devtools");
      return { default: mod.TanStackRouterDevtools };
    });

export interface DisplaySettings {
  showImages: boolean;
  setShowImages: (value: boolean) => void;
  richEffects: boolean;
  setRichEffects: (value: boolean) => void;
  cardFields: CardFields;
  setCardFields: (value: CardFields | ((prev: CardFields) => CardFields)) => void;
  maxColumns: number | null;
  setMaxColumns: (value: number | null | ((prev: number | null) => number | null)) => void;
}

const DisplaySettingsContext = createContext<DisplaySettings | null>(null);

export function useDisplaySettings(): DisplaySettings {
  const ctx = useContext(DisplaySettingsContext);
  if (!ctx) {
    throw new Error("useDisplaySettings must be used within RootComponent");
  }
  return ctx;
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootComponent,
});

function RootComponent() {
  const { theme, toggleTheme } = useTheme();
  const isAdmin = useMatch({ from: "/_authenticated/admin", shouldThrow: false });

  const [showImages, setShowImages] = useLocalStorage(
    "showImages",
    true,
    String,
    (raw) => raw === "true",
  );
  const [richEffects, setRichEffects] = useLocalStorage(
    "richEffects",
    true,
    String,
    (raw) => raw === "true",
  );
  const [cardFields, setCardFields] = useLocalStorage<CardFields>(
    "cardFields",
    DEFAULT_CARD_FIELDS,
    JSON.stringify,
    (raw) => ({ ...DEFAULT_CARD_FIELDS, ...JSON.parse(raw) }),
  );
  const [maxColumns, setMaxColumns] = useLocalStorage<number | null>(
    "maxColumns",
    null,
    JSON.stringify,
    (raw) => {
      const parsed = JSON.parse(raw);
      return typeof parsed === "number" ? parsed : null;
    },
  );

  return (
    <NuqsAdapter>
      <SWUpdateProvider>
        <DisplaySettingsContext.Provider
          value={{
            showImages,
            setShowImages,
            richEffects,
            setRichEffects,
            cardFields,
            setCardFields,
            maxColumns,
            setMaxColumns,
          }}
        >
          <div className="flex min-h-screen flex-col bg-background text-foreground">
            <Header darkMode={theme === "dark"} onDarkModeChange={toggleTheme} />
            {isAdmin ? (
              <div className="mx-auto flex w-full max-w-7xl wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide) flex-1 flex-col">
                <Outlet />
              </div>
            ) : (
              <>
                <main className="mx-auto flex w-full max-w-7xl wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide) flex-1 flex-col px-4 py-6">
                  <Outlet />
                </main>
                <Footer />
              </>
            )}
            <Toaster position="bottom-right" />
            <ReloadPrompt />
            <OfflineIndicator />
          </div>
          <TanStackRouterDevtools />
        </DisplaySettingsContext.Provider>
      </SWUpdateProvider>
    </NuqsAdapter>
  );
}
