import { LinkIcon } from "lucide-react";
import { siDiscord, siTwitch, siYoutube } from "simple-icons";

import { BrandGlyph } from "@/components/ui/brand-glyph";

import { DemoSection, Swatch, SwatchRow } from "./demo-primitives";

export function BrandGlyphSection() {
  return (
    <DemoSection
      id="brand-glyph"
      title="Brand glyph"
      note="A simple-icons brand mark that inherits text colour, falling back to a lucide icon when the brand is unknown. Used by contact chips and by promo source citations, where the mark is resolved from the link's host."
    >
      <SwatchRow label="Known brands">
        <Swatch label="YouTube">
          <BrandGlyph icon={siYoutube} fallback={LinkIcon} />
        </Swatch>
        <Swatch label="Twitch">
          <BrandGlyph icon={siTwitch} fallback={LinkIcon} />
        </Swatch>
        <Swatch label="Discord">
          <BrandGlyph icon={siDiscord} fallback={LinkIcon} />
        </Swatch>
      </SwatchRow>
      <SwatchRow label="Unknown brand (fallback)">
        <Swatch label="LinkIcon">
          <BrandGlyph fallback={LinkIcon} />
        </Swatch>
      </SwatchRow>
      <SwatchRow label="Sizes">
        <Swatch label="size-3">
          <BrandGlyph icon={siYoutube} fallback={LinkIcon} className="size-3" />
        </Swatch>
        <Swatch label="size-4 (default)">
          <BrandGlyph icon={siYoutube} fallback={LinkIcon} />
        </Swatch>
        <Swatch label="size-6">
          <BrandGlyph icon={siYoutube} fallback={LinkIcon} className="size-6" />
        </Swatch>
      </SwatchRow>
    </DemoSection>
  );
}
