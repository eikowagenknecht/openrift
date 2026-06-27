import { Radio } from "@base-ui/react/radio";
import type { DefaultCardView, Palette, Theme } from "@openrift/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { usePaletteStore } from "@/stores/palette-store";
import { useThemeStore } from "@/stores/theme-store";

import { ResetButton } from "./reset-button";

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
  const compactFilterView = useDisplayStore((s) => s.compactFilterView);
  const setCompactFilterView = useDisplayStore((s) => s.setCompactFilterView);
  const overrides = useDisplayStore((s) => s.overrides);
  const resetPreference = useDisplayStore((s) => s.resetPreference);
  const themePreference = useThemeStore((s) => s.preference);
  const setTheme = useThemeStore((s) => s.setTheme);
  const palettePreference = usePaletteStore((s) => s.preference);
  const setPalette = usePaletteStore((s) => s.setPalette);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display</CardTitle>
        <CardDescription>
          Light or dark, plus a few knobs for how cards are rendered.
        </CardDescription>
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

        {PALETTE_OPTIONS.length > 1 && (
          <div className="flex items-center justify-between gap-4">
            <Label>Palette</Label>
            <div className="flex items-center gap-1.5">
              <PalettePicker value={palettePreference} onChange={setPalette} />
              {palettePreference !== null && (
                <ResetButton onClick={() => setPalette(null)} label="Reset palette" />
              )}
            </div>
          </div>
        )}

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

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pref-compact-filters">Compact filters</Label>
          <div className="flex items-center gap-1.5">
            <Switch
              id="pref-compact-filters"
              checked={compactFilterView}
              onCheckedChange={(checked: boolean) => setCompactFilterView(checked)}
            />
            {overrides.compactFilterView !== null && (
              <ResetButton
                onClick={() => resetPreference("compactFilterView")}
                label="Reset compact filters"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme | "auto"; label: string }[] = [
  { value: "auto", label: "Auto" },
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
    <SegmentedRadio
      value={value ?? "auto"}
      onValueChange={(next) => onChange(next === "auto" ? null : (next as Theme))}
      options={THEME_OPTIONS}
    />
  );
}

// Palette is hidden from the UI until a second option ships. Adding an entry
// here automatically reveals the picker in DisplaySection.
const PALETTE_OPTIONS: { value: Palette; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "minimal", label: "Minimal" },
];

function PalettePicker({
  value,
  onChange,
}: {
  value: Palette | null;
  onChange: (value: Palette | null) => void;
}) {
  return (
    <SegmentedRadio
      value={value ?? "default"}
      onValueChange={(next) => onChange(next === "default" ? null : (next as Palette))}
      options={PALETTE_OPTIONS}
    />
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
    <SegmentedRadio
      value={value}
      onValueChange={(next) => onChange(next as DefaultCardView)}
      options={DEFAULT_CARD_VIEW_OPTIONS}
    />
  );
}

function SegmentedRadio<TValue extends string>({
  value,
  onValueChange,
  options,
}: {
  value: TValue;
  onValueChange: (value: TValue) => void;
  options: { value: TValue; label: string }[];
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as TValue)}
      className="bg-muted inline-flex w-fit flex-row items-center gap-0.5 rounded-md p-0.5"
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={cn(
            "rounded-sm border border-transparent px-2.5 py-1 text-sm font-medium transition-colors outline-none",
            "data-checked:bg-background data-checked:text-foreground data-checked:shadow-sm",
            "dark:data-checked:bg-input/30 dark:data-checked:border-input",
            "data-unchecked:text-muted-foreground data-unchecked:hover:text-foreground",
          )}
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
