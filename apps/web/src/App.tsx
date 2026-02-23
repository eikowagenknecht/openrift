import { CardBrowser } from "@/components/CardBrowser";
import type { CardFields } from "@/components/cards/CardThumbnail";
import { DEFAULT_CARD_FIELDS } from "@/components/cards/CardThumbnail";
import { DisplaySettingsMenu } from "@/components/DisplaySettingsMenu";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { ReloadPrompt } from "@/components/pwa/ReloadPrompt";
import { Toaster } from "@/components/ui/sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { SWUpdateProvider } from "@/hooks/use-sw-update";
import { useTheme } from "@/hooks/use-theme";

function App() {
  const { theme, toggleTheme } = useTheme();

  const [showImages, setShowImages] = useLocalStorage(
    "showImages",
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

  const [scrollIndicatorDrag, setScrollIndicatorDrag] = useLocalStorage(
    "scrollIndicatorDrag",
    false,
    String,
    (raw) => raw === "true",
  );

  const handleShowImagesChange = (show: boolean) => {
    setShowImages(show);
  };

  const handleCardFieldsChange = (update: Partial<CardFields>) => {
    setCardFields((prev) => ({ ...prev, ...update }));
  };

  return (
    <SWUpdateProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Header
          actions={
            <DisplaySettingsMenu
              showImages={showImages}
              onShowImagesChange={handleShowImagesChange}
              cardFields={cardFields}
              onCardFieldsChange={handleCardFieldsChange}
              darkMode={theme === "dark"}
              onDarkModeChange={() => toggleTheme()}
              scrollIndicatorDrag={scrollIndicatorDrag}
              onScrollIndicatorDragChange={setScrollIndicatorDrag}
            />
          }
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <CardBrowser
            showImages={showImages}
            cardFields={cardFields}
            maxColumns={maxColumns}
            onMaxColumnsChange={setMaxColumns}
            enableScrollDrag={scrollIndicatorDrag}
          />
        </main>
        <Footer />
        <Toaster position="bottom-right" />
        <ReloadPrompt />
        <OfflineIndicator />
      </div>
    </SWUpdateProvider>
  );
}

export default App;
