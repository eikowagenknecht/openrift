import { useState } from "react";

import { CardBrowser } from "@/components/CardBrowser";
import type { CardFields } from "@/components/cards/CardThumbnail";
import { DEFAULT_CARD_FIELDS } from "@/components/cards/CardThumbnail";
import { DisplaySettingsMenu } from "@/components/DisplaySettingsMenu";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { useTheme } from "@/hooks/use-theme";

function App() {
  const { theme, toggleTheme } = useTheme();

  const [showImages, setShowImages] = useState(() => {
    const stored = localStorage.getItem("showImages");
    return stored !== null ? stored === "true" : true;
  });
  const [cardFields, setCardFields] = useState<CardFields>(() => {
    const stored = localStorage.getItem("cardFields");
    if (stored) {
      try {
        return { ...DEFAULT_CARD_FIELDS, ...JSON.parse(stored) };
      } catch {
        // ignore malformed JSON
      }
    }
    return DEFAULT_CARD_FIELDS;
  });

  const handleShowImagesChange = (show: boolean) => {
    setShowImages(show);
    localStorage.setItem("showImages", String(show));
  };

  const handleCardFieldsChange = (update: Partial<CardFields>) => {
    setCardFields((prev) => {
      const next = { ...prev, ...update };
      localStorage.setItem("cardFields", JSON.stringify(next));
      return next;
    });
  };

  return (
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
    </div>
  );
}

export default App;
