import { HeartIcon } from "lucide-react";
import { useState } from "react";

import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { DemoRow, DemoSection, Swatch, SwatchRow } from "./demo-primitives";

export function TogglesSection() {
  const [view, setView] = useState("grid");
  return (
    <DemoSection
      id="toggles"
      title="Toggles"
      note="Toggle for a single pressed state, ToggleGroup for exclusive choices, Switch for settings."
    >
      <DemoRow
        label="Toggle variants"
        hint="Two variants: default (borderless) and outline. Shown unpressed and pressed."
      >
        <Toggle aria-label="Toggle, default variant">default</Toggle>
        <Toggle defaultPressed aria-label="Toggle, default variant, pressed">
          default pressed
        </Toggle>
        <Toggle variant="outline" aria-label="Toggle, outline variant">
          outline
        </Toggle>
        <Toggle variant="outline" defaultPressed aria-label="Toggle, outline variant, pressed">
          outline pressed
        </Toggle>
      </DemoRow>
      <SwatchRow label="Toggle sizes">
        <Swatch label="sm">
          <Toggle variant="outline" size="sm" aria-label="Small toggle">
            <HeartIcon /> Foils
          </Toggle>
        </Swatch>
        <Swatch label="default">
          <Toggle variant="outline" aria-label="Default-size toggle">
            <HeartIcon /> Foils
          </Toggle>
        </Swatch>
        <Swatch label="lg">
          <Toggle variant="outline" size="lg" aria-label="Large toggle">
            <HeartIcon /> Foils
          </Toggle>
        </Swatch>
      </SwatchRow>
      <DemoRow label="ToggleGroup" hint="The exclusive-choice strip (view modes).">
        <ToggleGroup
          value={[view]}
          onValueChange={(value) => {
            const next = value.at(0);
            if (typeof next === "string") {
              setView(next);
            }
          }}
        >
          <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
          <ToggleGroupItem value="table">Table</ToggleGroupItem>
        </ToggleGroup>
      </DemoRow>
    </DemoSection>
  );
}
