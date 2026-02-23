import { CardBrowser } from "@/components/CardBrowser";
import type { CardFields } from "@/components/cards/CardThumbnail";
import { DEFAULT_CARD_FIELDS } from "@/components/cards/CardThumbnail";
import { DisplaySettingsMenu } from "@/components/DisplaySettingsMenu";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { ReloadPrompt } from "@/components/pwa/ReloadPrompt";
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
            />
          }
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <CardBrowser showImages={showImages} cardFields={cardFields} />
        </main>
        <Footer />
        <ReloadPrompt />
        <OfflineIndicator />
      </div>
    </SWUpdateProvider>
  );
}

export default App;
