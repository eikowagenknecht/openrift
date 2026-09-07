import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardArtThumbStack } from "@/components/cards/card-art-thumb-stack";
import { CardFan, CardFanOutline } from "@/components/cards/card-fan";
import { CardMiniRow } from "@/components/cards/card-mini-row";
import { CoverBand } from "@/components/cover-band";

import { DemoRow, DemoSection, Swatch } from "./demo-primitives";

const PORTRAIT_SAMPLE_ART = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 63 88'><defs><linearGradient id='p' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#6366f1'/><stop offset='1' stop-color='#0ea5e9'/></linearGradient></defs><rect width='63' height='88' fill='url(#p)'/><circle cx='31.5' cy='26' r='10' fill='#fde047'/><text x='31.5' y='58' font-family='sans-serif' font-size='8' font-weight='bold' fill='white' text-anchor='middle'>UNIT</text></svg>",
)}`;

const LANDSCAPE_SAMPLE_ART = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 88 63'><defs><linearGradient id='l' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#059669'/><stop offset='1' stop-color='#84cc16'/></linearGradient></defs><rect width='88' height='63' fill='url(#l)'/><text x='44' y='37' font-family='sans-serif' font-size='9' font-weight='bold' fill='white' text-anchor='middle'>BATTLEFIELD</text></svg>",
)}`;

export function CardThumbnailsSection() {
  return (
    <DemoSection
      id="card-thumbnails"
      title="Card thumbnails"
      note="CardArtThumb is the lightweight, image-only card frame for lists, tooltips, and stats — three shapes off one prop. shape=card is the portrait card frame, for where the thumb stands in for the card object (covers, tier tiles, stats, floating previews). shape=strip is the wide crop that leads a list row. shape=square is the avatar-sized crop of the art's top, for where a card stands in for a legend beside a name. Size any of them with a width or height utility; the other axis follows. The full grid tile (foil, pricing, sibling fan-out) is CardThumbnail; the whole row lead is CardMiniRow."
      docs="components/cards/card-art-thumb.tsx"
    >
      <DemoRow
        label="Shapes"
        hint="Same art. card locks to the portrait card ratio; strip locks to the landscape-card ratio (88/63) and crops portrait art to its illustration band, which at row height beats its middle landing on the type line; square crops the top, where the splash is."
      >
        <Swatch label="card">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="h-14" />
        </Swatch>
        <Swatch label="strip">
          <CardArtThumb shape="strip" src={PORTRAIT_SAMPLE_ART} className="h-14" />
        </Swatch>
        <Swatch label="square">
          <CardArtThumb shape="square" src={PORTRAIT_SAMPLE_ART} className="h-14" />
        </Swatch>
      </DemoRow>
      <DemoRow label="Sizes" hint="Height- or width-driven; the shape's aspect ratio stays fixed.">
        <Swatch label="h-8">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="h-8" />
        </Swatch>
        <Swatch label="h-10">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="h-10" />
        </Swatch>
        <Swatch label="h-14">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="h-14" />
        </Swatch>
        <Swatch label="w-16">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="w-16" />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="Strip sizes"
        hint="h-6 is the default, and the deck list's size. Rows that carry more text step up."
      >
        <Swatch label="h-6 (default)">
          <CardArtThumb shape="strip" src={PORTRAIT_SAMPLE_ART} />
        </Swatch>
        <Swatch label="h-8">
          <CardArtThumb shape="strip" src={PORTRAIT_SAMPLE_ART} className="h-8" />
        </Swatch>
        <Swatch label="h-10">
          <CardArtThumb shape="strip" src={PORTRAIT_SAMPLE_ART} className="h-10" />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="Battlefield (landscape)"
        hint="Same source image throughout. A card frame must rotate the art -90° to fill it. A strip is already the art's own ratio, so it fills edge to edge untouched — which is why battlefields read at row size."
      >
        <Swatch label="card, no prop → cropped">
          <CardArtThumb src={LANDSCAPE_SAMPLE_ART} className="h-14" />
        </Swatch>
        <Swatch label="card + landscape → rotated">
          <CardArtThumb src={LANDSCAPE_SAMPLE_ART} landscape className="h-14" />
        </Swatch>
        <Swatch label="strip + landscape → whole">
          <CardArtThumb shape="strip" src={LANDSCAPE_SAMPLE_ART} landscape className="h-14" />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="Empty states"
        hint="Shown when no image resolves, or the image fails to load. Both shapes share one fallback chain, so a printing catalogued before its art is rehosted degrades the same way everywhere."
      >
        <Swatch label="generic">
          <CardArtThumb imageId={null} className="h-14" />
        </Swatch>
        <Swatch label="rarity watermark">
          <CardArtThumb imageId={null} rarity="showcase" className="h-14" />
        </Swatch>
        <Swatch label="domain tint">
          <CardArtThumb imageId={null} rarity="showcase" domains={["chaos"]} className="h-14" />
        </Swatch>
        <Swatch label="strip, domain tint">
          <CardArtThumb
            shape="strip"
            imageId={null}
            rarity="showcase"
            domains={["chaos"]}
            className="h-14"
          />
        </Swatch>
        <Swatch label="square, domain tint">
          <CardArtThumb
            shape="square"
            imageId={null}
            rarity="showcase"
            domains={["chaos"]}
            className="h-14"
          />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="CardMiniRow"
        hint="The lead of a card list row: strip art, the domain color bar, and an optional rarity icon + short code. Everything after the art is opt-in — pass only what the row has data for. This is the app's one small-card treatment outside the browsing grids."
      >
        <Swatch label="art only">
          <CardMiniRow src={PORTRAIT_SAMPLE_ART} />
        </Swatch>
        <Swatch label="+ domain bar">
          <CardMiniRow src={PORTRAIT_SAMPLE_ART} domains={["chaos"]} />
        </Swatch>
        <Swatch label="dual domain">
          <CardMiniRow src={PORTRAIT_SAMPLE_ART} domains={["fury", "calm"]} />
        </Swatch>
        <Swatch label="full cluster">
          <CardMiniRow
            src={PORTRAIT_SAMPLE_ART}
            domains={["chaos"]}
            rarity="showcase"
            shortCode="OGN-042"
          />
        </Swatch>
        <Swatch label="battlefield">
          <CardMiniRow
            src={LANDSCAPE_SAMPLE_ART}
            landscape
            domains={["order"]}
            rarity="showcase"
            shortCode="OGN-118"
          />
        </Swatch>
        <Swatch label="no art on file">
          <CardMiniRow imageId={null} domains={["fury"]} rarity="showcase" shortCode="OGN-007" />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="CardFan on CoverBand"
        hint="Fanned card art on the warm-glow CoverBand (product tiles, event heroes). CardFanOutline is the no-art stand-in; anchor=center floats the fan mid-band for taller hero bands. xs is the archive's podium fan, laid out in podium order so the first cover sits centred in front."
      >
        <Swatch label="xs / center">
          <CoverBand aria-hidden="true" className="h-28 w-56 overflow-hidden rounded-lg">
            <CardFan
              size="xs"
              anchor="center"
              covers={[
                { key: "a", src: PORTRAIT_SAMPLE_ART },
                { key: "b", src: PORTRAIT_SAMPLE_ART },
                { key: "c", src: PORTRAIT_SAMPLE_ART },
              ]}
            />
          </CoverBand>
        </Swatch>
        <Swatch label="sm / bottom">
          <CoverBand aria-hidden="true" className="h-36 w-72 overflow-hidden rounded-lg">
            <CardFan
              covers={[
                { key: "a", src: PORTRAIT_SAMPLE_ART },
                { key: "b", src: PORTRAIT_SAMPLE_ART },
                { key: "c", src: PORTRAIT_SAMPLE_ART },
              ]}
            />
          </CoverBand>
        </Swatch>
        <Swatch label="outline">
          <CoverBand aria-hidden="true" className="h-36 w-72 overflow-hidden rounded-lg">
            <CardFanOutline />
          </CoverBand>
        </Swatch>
      </DemoRow>
      <DemoRow
        label="CardArtThumbStack"
        hint="Overlapping thumbs with a +N pill — one row standing for many cards (aggregated activity events, batch summaries). max caps the visible thumbs."
      >
        <Swatch label="3 items">
          <CardArtThumbStack
            items={Array.from({ length: 3 }, (_, index) => ({
              key: `s${index}`,
              src: PORTRAIT_SAMPLE_ART,
            }))}
          />
        </Swatch>
        <Swatch label="8 items, max 5 → +3">
          <CardArtThumbStack
            items={Array.from({ length: 8 }, (_, index) => ({
              key: `m${index}`,
              src: PORTRAIT_SAMPLE_ART,
            }))}
          />
        </Swatch>
        <Swatch label="thumbClassName=w-10">
          <CardArtThumbStack
            thumbClassName="w-10"
            items={Array.from({ length: 4 }, (_, index) => ({
              key: `l${index}`,
              src: PORTRAIT_SAMPLE_ART,
            }))}
          />
        </Swatch>
      </DemoRow>
    </DemoSection>
  );
}
