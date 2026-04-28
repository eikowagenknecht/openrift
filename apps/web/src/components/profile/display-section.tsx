import type { DefaultCardView, Theme } from "@openrift/shared";
import { RotateCcwIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useThemeStore } from "@/stores/theme-store";

export function DisplaySection() {
  const showImages = useDisplayStore((s) => s.showImages);
  const setShowImages = useDisplayStore((s) => s.setShowImages);
  const fancyFan = useDisplayStore((s) => s.fancyFan);
  const setFancyFan = useDisplayStore((s) => s.setFancyFan);
  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const setFoilEffect = useDisplayStore((s) => s.setFoilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);
  const setCardTilt = useDisplayStore((s) => s.setCardTilt);
  const defaultCardView = useDisplayStore((s) => s.defaultCardView);
  const setDefaultCardView = useDisplayStore((s) => s.setDefaultCardView);
  const overrides = useDisplayStore((s) => s.overrides);
  const resetPreference = useDisplayStore((s) => s.resetPreference);
  const themePreference = useThemeStore((s) => s.preference);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display</CardTitle>
        <CardDescription>Theme and visual settings for how cards appear.</CardDescription>
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
          <Label>Default card view</Label>
          <div className="flex items-center gap-1.5">
            <DefaultCardViewPicker value={defaultCardView} onChange={setDefaultCardView} />
            {overrides.defaultCardView !== null && (
              <ResetButton
                onClick={() => resetPreference("defaultCardView")}
                label="Reset default card view"
              />
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
          <Label htmlFor="pref-foil">Foil effect</Label>
          <div className="flex items-center gap-1.5">
            <Switch
              id="pref-foil"
              checked={foilEffect}
              onCheckedChange={(checked: boolean) => setFoilEffect(checked)}
            />
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
      </CardContent>
    </Card>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ResetButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className="text-muted-foreground hover:text-foreground relative z-10 p-1 transition-colors"
            aria-label={label}
          />
        }
      >
        <RotateCcwIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>Reset to default</TooltipContent>
    </Tooltip>
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

const DEFAULT_CARD_VIEW_OPTIONS: { value: DefaultCardView; label: string }[] = [
  { value: "cards", label: "Cards" },
  { value: "printings", label: "Printings" },
];

function DefaultCardViewPicker({
  value,
  onChange,
}: {
  value: DefaultCardView;
  onChange: (value: DefaultCardView) => void;
}) {
  return (
    <div className="bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5">
      {DEFAULT_CARD_VIEW_OPTIONS.map((option) => (
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
