import { LayersIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { ClipFrame } from "@/components/marketing/clip-frame";
import { OrnamentBase, OrnamentRule } from "@/components/ui/ornament";

import { DemoRow, DemoSection } from "./demo-primitives";

export function OrnamentsSection() {
  return (
    <DemoSection
      id="ornaments"
      title="Ornaments"
      note="The card-border motif, taken from the edge of the printed card text box: a hairline with a diamond gem, a bracket base with stepped caps and a medallion, and corner brackets for hairline frames. Gold goes only where the gold hairline already goes (marketing headings, the landing page, the footer, the card-grid set headers), never on Card edges, inputs, tables or menus. Silver is for the black stage ground only."
      docs="docs/design-language.md → Accents"
    >
      <DemoRow label="Under a left-aligned heading" hint="fades both ends (default), w-40">
        <div className="flex w-full flex-col gap-4">
          <Heading level={1} as="h3">
            Switching? Bring your collection.
          </Heading>
          <OrnamentRule className="w-40" />
        </div>
      </DemoRow>
      <DemoRow label="Centered" hint="the footer and centered headings, w-56">
        <div className="flex w-full flex-col items-center gap-4">
          <Heading level={1} as="h3">
            Ready when you are.
          </Heading>
          <OrnamentRule className="w-56" />
        </div>
      </DemoRow>
      <DemoRow label="Labelled divider" hint='fade="tips" with children, the card-grid set headers'>
        <OrnamentRule fade="tips" className="w-full">
          <span className="flex flex-row gap-3 text-sm">
            <span className="text-muted-foreground font-medium">OGN</span>
            <span className="font-semibold">Origins</span>
          </span>
        </OrnamentRule>
      </DemoRow>
      <DemoRow
        label="Bracket base"
        hint="OrnamentBase closes a panel that drops its bottom edge and draws its sides in the tone color; surfaceClassName carries the panel background down to the line. The medallion holds an icon or a gem. Closes the card detail text box, rarity glyph in the medallion."
      >
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <div className="flex flex-col">
            <div className="bg-muted/30 border-border-accent rounded-t-lg border border-b-0 px-4 pt-3 pb-2">
              <p className="text-muted-foreground italic">&ldquo;I am the first of many.&rdquo;</p>
            </div>
            <OrnamentBase surfaceClassName="bg-muted/30">
              <LayersIcon className="size-3" />
            </OrnamentBase>
          </div>
          <div className="flex flex-col">
            <div className="bg-muted/30 border-border-accent rounded-t-lg border border-b-0 px-4 pt-3 pb-2">
              <p className="font-heading text-2xl font-semibold tabular-nums">1,284</p>
            </div>
            <OrnamentBase surfaceClassName="bg-muted/30" />
          </div>
        </div>
      </DemoRow>
      <DemoRow label="Silver" hint='tone="silver" on the stage ground, plate matching the ground'>
        <div className="dark flex w-full flex-col gap-6 rounded-lg bg-[#08090c] p-6 text-white">
          <div className="flex flex-col items-end gap-1.5">
            <span className="font-heading font-semibold">Summoner Skirmish · Top 8</span>
            <OrnamentRule tone="silver" className="w-64" />
          </div>
          <div className="flex w-64 flex-col">
            <div className="border-muted-foreground rounded-t-lg border border-b-0 bg-white/5 px-3 pt-2.5 pb-2 text-sm text-white/70">
              When another non-Recruit unit you control dies, play a Recruit unit token.
            </div>
            <OrnamentBase
              tone="silver"
              plateClassName="bg-[#08090c]"
              surfaceClassName="bg-white/5"
            />
          </div>
        </div>
      </DemoRow>
      <DemoRow
        label="Corner brackets"
        hint="ClipFrame ornament: three chamfered corners, the cut stays as the fourth"
      >
        <ClipFrame ornament className="flex flex-col gap-3 p-6">
          <Heading level={1} as="h3">
            Switching? Bring your collection.
          </Heading>
          <OrnamentRule className="w-40" />
          <p className="text-muted-foreground text-sm">
            Import a CSV from Piltover Archive, RiftCore, or RiftMana.
          </p>
        </ClipFrame>
      </DemoRow>
    </DemoSection>
  );
}
