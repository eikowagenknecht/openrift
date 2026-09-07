import { PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";

import { DemoRow, DemoSection, Swatch, SwatchRow } from "./demo-primitives";

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
  "link-muted",
  "dashed",
  "glass-pill",
] as const;

const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;
const ICON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;

export function ButtonsSection() {
  return (
    <DemoSection
      id="buttons"
      title="Buttons"
      note="One filled primary per surface; ghost for secondary icon actions. Never hand-roll heights."
      docs="docs/design-language.md"
    >
      <SwatchRow label="Variants" hint="All variants at the default size (h-8).">
        {BUTTON_VARIANTS.map((variant) => (
          <Swatch key={variant} label={variant} colors>
            <Button variant={variant}>{variant}</Button>
          </Swatch>
        ))}
      </SwatchRow>
      <SwatchRow label="Sizes" hint="Labeled sizes shown on the outline variant.">
        {BUTTON_SIZES.map((size) => (
          <Swatch key={size} label={size}>
            <Button variant="outline" size={size}>
              Button
            </Button>
          </Swatch>
        ))}
      </SwatchRow>
      <SwatchRow label="Icon sizes" hint="Square icon-only sizes, shown on the ghost variant.">
        {ICON_SIZES.map((size) => (
          <Swatch key={size} label={size}>
            <Button variant="ghost" size={size} aria-label={`Settings (${size})`}>
              <SettingsIcon />
            </Button>
          </Swatch>
        ))}
      </SwatchRow>
      <DemoRow label="With icon / disabled / group">
        <Button>
          <PlusIcon /> Add card
        </Button>
        <Button variant="destructive">
          <Trash2Icon /> Delete deck
        </Button>
        <Button disabled>Disabled</Button>
        <ButtonGroup>
          <Button variant="outline">Cards</Button>
          <ButtonGroupSeparator />
          <Button variant="outline">Printings</Button>
          <ButtonGroupSeparator />
          <Button variant="outline">Copies</Button>
        </ButtonGroup>
      </DemoRow>
    </DemoSection>
  );
}
