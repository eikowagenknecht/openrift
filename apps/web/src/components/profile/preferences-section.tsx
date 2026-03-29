import type { FoilEffect, Marketplace, Theme } from "@openrift/shared";
import { ALL_MARKETPLACES } from "@openrift/shared";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useThemeStore } from "@/stores/theme-store";

const CARD_FIELD_ITEMS = [
  { key: "number" as const, label: "ID", example: "OGN-027" },
  { key: "title" as const, label: "Title", example: "Flamecaster" },
  { key: "type" as const, label: "Type", example: "Champion" },
  { key: "rarity" as const, label: "Rarity", example: "Rare" },
  { key: "price" as const, label: "Price", example: "$2.50" },
];

const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  tcgplayer: "TCGplayer",
  cardmarket: "Cardmarket",
  cardtrader: "CardTrader",
};

const MARKETPLACE_CURRENCY: Record<Marketplace, string> = {
  tcgplayer: "USD",
  cardmarket: "EUR",
  cardtrader: "EUR",
};

export function PreferencesSection() {
  const showImages = useDisplayStore((s) => s.showImages);
  const setShowImages = useDisplayStore((s) => s.setShowImages);
  const fancyFan = useDisplayStore((s) => s.fancyFan);
  const setFancyFan = useDisplayStore((s) => s.setFancyFan);
  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const setFoilEffect = useDisplayStore((s) => s.setFoilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);
  const setCardTilt = useDisplayStore((s) => s.setCardTilt);
  const visibleFields = useDisplayStore((s) => s.visibleFields);
  const setVisibleFields = useDisplayStore((s) => s.setVisibleFields);
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const setMarketplaceOrder = useDisplayStore((s) => s.setMarketplaceOrder);
  const overrides = useDisplayStore((s) => s.overrides);
  const resetPreference = useDisplayStore((s) => s.resetPreference);
  const resetVisibleField = useDisplayStore((s) => s.resetVisibleField);
  const themePreference = useThemeStore((s) => s.preference);
  const setTheme = useThemeStore((s) => s.setTheme);

  const enabledSet = new Set(marketplaceOrder);

  function toggleMarketplace(marketplace: Marketplace) {
    if (enabledSet.has(marketplace)) {
      setMarketplaceOrder(marketplaceOrder.filter((m) => m !== marketplace));
    } else {
      setMarketplaceOrder([...marketplaceOrder, marketplace]);
    }
  }

  function moveMarketplace(marketplace: Marketplace, direction: -1 | 1) {
    const index = marketplaceOrder.indexOf(marketplace);
    if (index === -1) {
      return;
    }
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= marketplaceOrder.length) {
      return;
    }
    const next = [...marketplaceOrder];
    next.splice(index, 1);
    next.splice(newIndex, 0, marketplace);
    setMarketplaceOrder(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Display settings that follow your account across devices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label>Theme</Label>
          <div className="flex items-center gap-1.5">
            <ThemePicker value={themePreference} onChange={setTheme} />
            {themePreference !== null && (
              <ResetButton onClick={() => setTheme(null)} label="Reset theme" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pref-images">Show card images</Label>
          <div className="flex items-center gap-1.5">
            <Switch
              id="pref-images"
              checked={showImages}
              onCheckedChange={(checked: boolean) => setShowImages(checked)}
            />
            {overrides.showImages !== null && (
              <ResetButton
                onClick={() => resetPreference("showImages")}
                label="Reset show images"
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pref-fan">Fancy card fan</Label>
          <div className="flex items-center gap-1.5">
            <Switch
              id="pref-fan"
              checked={fancyFan}
              onCheckedChange={(checked: boolean) => setFancyFan(checked)}
            />
            {overrides.fancyFan !== null && (
              <ResetButton onClick={() => resetPreference("fancyFan")} label="Reset fancy fan" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label>Foil effect</Label>
          <div className="flex items-center gap-1.5">
            <FoilEffectPicker value={foilEffect} onChange={setFoilEffect} />
            {overrides.foilEffect !== null && (
              <ResetButton
                onClick={() => resetPreference("foilEffect")}
                label="Reset foil effect"
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pref-tilt">Card tilt on hover</Label>
          <div className="flex items-center gap-1.5">
            <Switch
              id="pref-tilt"
              checked={cardTilt}
              onCheckedChange={(checked: boolean) => setCardTilt(checked)}
            />
            {overrides.cardTilt !== null && (
              <ResetButton onClick={() => resetPreference("cardTilt")} label="Reset card tilt" />
            )}
          </div>
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
                <div className="flex items-center gap-1.5">
                  <Switch
                    id={`pref-field-${item.key}`}
                    checked={visibleFields[item.key]}
                    onCheckedChange={(checked: boolean) =>
                      setVisibleFields({ ...visibleFields, [item.key]: checked })
                    }
                  />
                  {overrides.visibleFields[item.key] !== null && (
                    <ResetButton
                      onClick={() => resetVisibleField(item.key)}
                      label={`Reset ${item.label}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Marketplaces</Label>
              <p className="text-muted-foreground text-sm">
                Enable and reorder price sources. The first one is shown in the card grid.
              </p>
            </div>
            {overrides.marketplaceOrder !== null && (
              <ResetButton
                onClick={() => resetPreference("marketplaceOrder")}
                label="Reset marketplace order"
              />
            )}
          </div>

          <div className="space-y-1 pt-1">
            {/* Show enabled marketplaces first (in order), then disabled ones */}
            {[...marketplaceOrder, ...ALL_MARKETPLACES.filter((m) => !enabledSet.has(m))].map(
              (marketplace) => {
                const enabled = enabledSet.has(marketplace);
                const index = marketplaceOrder.indexOf(marketplace);
                return (
                  <div
                    key={marketplace}
                    className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`pref-mp-${marketplace}`}
                        checked={enabled}
                        onCheckedChange={() => toggleMarketplace(marketplace)}
                      />
                      <Label htmlFor={`pref-mp-${marketplace}`} className="font-normal">
                        {MARKETPLACE_LABELS[marketplace]}
                      </Label>
                      <span className="text-muted-foreground text-xs">
                        {MARKETPLACE_CURRENCY[marketplace]}
                      </span>
                      {enabled && index === 0 && (
                        <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
                          Favorite
                        </span>
                      )}
                    </div>
                    {enabled && (
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === 0}
                          onClick={() => moveMarketplace(marketplace, -1)}
                          aria-label={`Move ${MARKETPLACE_LABELS[marketplace]} up`}
                        >
                          <ArrowUp className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === marketplaceOrder.length - 1}
                          onClick={() => moveMarketplace(marketplace, 1)}
                          aria-label={`Move ${MARKETPLACE_LABELS[marketplace]} down`}
                        >
                          <ArrowDown className="size-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ResetButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground transition-colors"
      aria-label={label}
      title="Reset to default"
    >
      <RotateCcw className="size-3.5" />
    </button>
  );
}

const FOIL_OPTIONS: { value: FoilEffect; label: string }[] = [
  { value: "none", label: "None" },
  { value: "static", label: "Static" },
  { value: "animated", label: "Animated" },
];

function FoilEffectPicker({
  value,
  onChange,
}: {
  value: FoilEffect;
  onChange: (value: FoilEffect) => void;
}) {
  return (
    <div className="bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5">
      {FOIL_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "rounded-sm px-2.5 py-1 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const THEME_OPTIONS: { value: Theme | null; label: string }[] = [
  { value: null, label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function ThemePicker({
  value,
  onChange,
}: {
  value: Theme | null;
  onChange: (value: Theme | null) => void;
}) {
  return (
    <div className="bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value ?? "auto"}
          type="button"
          className={cn(
            "rounded-sm px-2.5 py-1 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
