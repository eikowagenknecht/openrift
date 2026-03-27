import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDisplayStore } from "@/stores/display-store";
import { useThemeStore } from "@/stores/theme-store";

const CARD_FIELD_ITEMS = [
  { key: "number" as const, label: "ID", example: "OGN-027" },
  { key: "title" as const, label: "Title", example: "Flamecaster" },
  { key: "type" as const, label: "Type", example: "Champion" },
  { key: "rarity" as const, label: "Rarity", example: "Rare" },
  { key: "price" as const, label: "Price", example: "$2.50" },
];

export function PreferencesSection() {
  const showImages = useDisplayStore((s) => s.showImages);
  const setShowImages = useDisplayStore((s) => s.setShowImages);
  const richEffects = useDisplayStore((s) => s.richEffects);
  const setRichEffects = useDisplayStore((s) => s.setRichEffects);
  const visibleFields = useDisplayStore((s) => s.visibleFields);
  const setVisibleFields = useDisplayStore((s) => s.setVisibleFields);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Display settings that follow your account across devices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pref-theme">Theme</Label>
          <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pref-images">Show card images</Label>
          <Switch
            id="pref-images"
            checked={showImages}
            onCheckedChange={(checked: boolean) => setShowImages(checked)}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pref-effects">Rich effects</Label>
          <Switch
            id="pref-effects"
            checked={richEffects}
            onCheckedChange={(checked: boolean) => setRichEffects(checked)}
          />
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>Card fields</Label>
          <p className="text-muted-foreground text-sm">Choose which fields to show on cards.</p>

          <div className="space-y-3 pt-1">
            {CARD_FIELD_ITEMS.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`pref-field-${item.key}`} className="font-normal">
                    {item.label}
                  </Label>
                  <span className="text-muted-foreground text-xs">e.g. {item.example}</span>
                </div>
                <Switch
                  id={`pref-field-${item.key}`}
                  checked={visibleFields[item.key]}
                  onCheckedChange={(checked: boolean) =>
                    setVisibleFields({ ...visibleFields, [item.key]: checked })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
