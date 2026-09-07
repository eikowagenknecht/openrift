import { useState } from "react";

import { MetaIdentity } from "@/features/meta/components/meta-identity";
import { MetaScopeBar } from "@/features/meta/components/meta-scope-bar";
import { MetaTierBadge } from "@/features/meta/components/meta-tier-badge";
import { useMetaEras } from "@/features/meta/hooks/use-meta-eras";
import { formatRecord } from "@/features/meta/lib/meta-format";
import type { MetaScope } from "@/features/meta/lib/meta-scope";

import { Demo, DemoRow, DemoSection, Swatch, SwatchRow } from "./demo-primitives";

const DEMO_LEGEND = "Lux, Lady of Luminosity";

export function MetaArchiveSection() {
  const [scope, setScope] = useState<MetaScope>({});
  const eras = useMetaEras();
  return (
    <DemoSection
      id="meta-archive"
      title="Meta archive"
      note="The archive's shared identity pieces. Every /meta surface composes these rather than rolling its own: one tier badge, one identity unit, one scope bar."
      docs="components/meta/"
    >
      <SwatchRow
        label="MetaTierBadge"
        hint="Gold is the archive's colour for winning, so only Premier carries the accent hairline. Competitive's teal is written out for both themes because the dark primary is amber and a themed outline would land back on the Premier gold."
      >
        {(["premier", "competitive", "local"] as const).map((tier) => (
          <Swatch key={tier} label={tier} colors>
            <MetaTierBadge tier={tier} />
          </Swatch>
        ))}
      </SwatchRow>

      <DemoRow
        label="MetaIdentity"
        hint="Champion name, legend card title, domain runes. The card title always renders — the compact top-8 bracket is the one surface allowed to drop it. Pass a slug to link the champion; omit it inside a wrapper that is itself a link."
        className="items-start gap-6"
      >
        <Demo name="row" hint="Bylines and headers.">
          <MetaIdentity name={DEMO_LEGEND} domains={["order", "calm"]} />
        </Demo>
        <Demo name="stacked" hint="Two-line table cell.">
          <MetaIdentity name={DEMO_LEGEND} domains={["order", "calm"]} layout="stacked" />
        </Demo>
        <Demo name="tile" hint="Deck tiles and winner cards.">
          <MetaIdentity name={DEMO_LEGEND} domains={["order", "calm"]} layout="tile" />
        </Demo>
        <Demo name="championOnly" hint="The compact bracket, and nowhere else.">
          <MetaIdentity name={DEMO_LEGEND} championOnly />
        </Demo>
        <Demo name="linked" hint="Links the champion at its card page.">
          <MetaIdentity name={DEMO_LEGEND} slug="lady-of-luminosity" />
        </Demo>
        <Demo name="untagged" hint="A legend with no champion is all champion.">
          <MetaIdentity name="Emperor of the Sands" />
        </Demo>
      </DemoRow>

      <DemoRow
        label="MetaScopeBar"
        hint="One bar on every archive page: era (set eras derived from release dates, plus all time and a custom range), format, tier, country. The URL wiring lives in useMetaScope; the bar itself is controlled. The country select only appears once there is more than one to choose between."
        className="flex-col items-stretch gap-3"
      >
        <MetaScopeBar
          scope={scope}
          setScope={(patch) => setScope((prev) => ({ ...prev, ...patch }))}
          clearScope={() => setScope({})}
          eras={eras}
          countries={["de", "jp", "us"]}
        />
        <p className="text-muted-foreground text-2xs font-mono">{JSON.stringify(scope)}</p>
      </DemoRow>

      <DemoRow
        label="formatRecord"
        hint="Records always render all three parts. A source with no draw column ran no draws, and a column mixing 5-1 with 5-1-0 reads as two different kinds of number."
      >
        <span className="font-heading tabular-nums">{formatRecord(14, 1, 0)}</span>
        <span className="font-heading tabular-nums">{formatRecord(5, 1, null)}</span>
      </DemoRow>
    </DemoSection>
  );
}
