import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useCssVars } from "@/hooks/use-css-vars";
import { parsePx, useElementSpec } from "@/hooks/use-element-spec";
import { cn } from "@/lib/utils";

import { DemoRow, DemoSection, Swatch, SwatchRow } from "./demo-primitives";

const COLOR_PAIRS = [
  { token: "--background", fg: "var(--foreground)" },
  { token: "--card", fg: "var(--card-foreground)" },
  { token: "--popover", fg: "var(--popover-foreground)" },
  { token: "--primary", fg: "var(--primary-foreground)" },
  { token: "--secondary", fg: "var(--secondary-foreground)" },
  { token: "--muted", fg: "var(--muted-foreground)" },
  { token: "--accent", fg: "var(--accent-foreground)" },
  // Buttons put white text on the destructive fill; there is no
  // --destructive-foreground in this theme.
  { token: "--destructive", fg: "white" },
] as const;

const STATUS_COLOR_PAIRS = [
  { token: "--success", fg: "var(--success-foreground)" },
  { token: "--warning", fg: "var(--warning-foreground)" },
  { token: "--info", fg: "var(--info-foreground)" },
  { token: "--violet", fg: "var(--background)" },
  { token: "--success-soft", fg: "var(--success)" },
  { token: "--warning-soft", fg: "var(--warning)" },
  { token: "--info-soft", fg: "var(--info)" },
  { token: "--violet-soft", fg: "var(--violet)" },
  { token: "--destructive-soft", fg: "var(--destructive)" },
] as const;

const LINE_COLOR_TOKENS = [
  "--border",
  "--border-accent",
  "--border-opaque",
  "--input",
  "--ring",
] as const;

const CHART_COLOR_TOKENS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

const TOKEN_NAMES = [
  ...COLOR_PAIRS.map((pair) => pair.token),
  ...STATUS_COLOR_PAIRS.map((pair) => pair.token),
  ...LINE_COLOR_TOKENS,
  ...CHART_COLOR_TOKENS,
];

// Literal class names so Tailwind's scanner generates them.
const RADIUS_CLASSES = [
  "rounded-sm",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "rounded-2xl",
  "rounded-3xl",
  "rounded-4xl",
  "rounded-full",
] as const;

const HEIGHT_TIERS = [
  { cls: "h-5", note: "count pills, chips" },
  { cls: "h-6", note: "xs buttons" },
  { cls: "h-7", note: "sm buttons" },
  { cls: "h-8", note: "default controls" },
  { cls: "h-9", note: "lg buttons" },
  { cls: "h-14", note: "global header" },
] as const;

const TYPE_TIERS: readonly { role: string; cls: string; note?: string }[] = [
  { role: "Hero", cls: "text-4xl font-bold", note: "landing only, md:text-5xl" },
  { role: "Page title (h1)", cls: "font-heading text-2xl font-bold" },
  { role: "Section (h2)", cls: "font-heading text-lg font-semibold" },
  { role: "Subsection / card title (h3)", cls: "text-base font-medium" },
  { role: "Body", cls: "", note: "responsive: 1.05rem phone, 15px from sm:" },
  { role: "Compact UI", cls: "text-sm" },
  { role: "Metadata", cls: "text-xs" },
  { role: "Micro", cls: "text-2xs" },
];

function ColorTokenTile({ token, fg, value }: { token: string; fg?: string; value?: string }) {
  const { copy } = useCopyToClipboard();

  async function handleCopy() {
    if (await copy(`var(${token})`)) {
      toast.success(`Copied var(${token})`);
    } else {
      toast.error("Could not copy the token");
    }
  }

  return (
    <Pressable
      className="group flex min-w-0 flex-col gap-1 text-left"
      onClick={() => void handleCopy()}
    >
      <span
        className="border-border-opaque flex h-12 items-center justify-center rounded-md border text-sm"
        style={{ backgroundColor: `var(${token})`, color: fg }}
      >
        {fg ? "Aa" : null}
      </span>
      <span className="truncate font-mono text-xs">{token.slice(2)}</span>
      <span className="text-muted-foreground text-2xs truncate font-mono" title={value}>
        {value ?? "…"}
      </span>
    </Pressable>
  );
}

function TypeSpecimen({ role, cls, note }: { role: string; cls: string; note?: string }) {
  const { ref, spec } = useElementSpec<HTMLDivElement>();
  const fontSize = spec ? parsePx(spec.fontSize) : Number.NaN;
  return (
    <div className="flex flex-col gap-0.5 border-b pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <div ref={ref} className="min-w-0">
        <p className={cn("truncate", cls)}>Summoner Skirmish</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-muted-foreground text-xs">{note ? `${role} · ${note}` : role}</span>
        <span className="font-mono text-xs">{cls === "" ? "(no size class)" : cls}</span>
        <span className="text-muted-foreground text-2xs font-mono">
          {Number.isFinite(fontSize) ? `${Math.round(fontSize * 10) / 10}px` : ""}
        </span>
      </div>
    </div>
  );
}

export function TokensSection() {
  const values = useCssVars(TOKEN_NAMES);
  return (
    <DemoSection
      id="tokens"
      title="Tokens"
      note="The theme vocabulary everything below is built from. Values are read live from the rendered page: toggle theme or palette in the header and they follow. The sidebar-* variables mirror the core set for the app chrome and are omitted here."
      docs="apps/web/src/index.css · docs/design-language.md · docs/typography.md"
    >
      <DemoRow
        label="Color pairs"
        hint="Background token with its paired foreground as the Aa sample. Click a tile to copy its var()."
      >
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {COLOR_PAIRS.map((pair) => (
            <ColorTokenTile
              key={pair.token}
              token={pair.token}
              fg={pair.fg}
              value={values[pair.token]}
            />
          ))}
        </div>
      </DemoRow>
      <DemoRow
        label="Status"
        hint="Success, warning, info and violet with their soft fills. Use these for state; never a raw Tailwind hue. Gold accents use --border-accent."
      >
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-9">
          {STATUS_COLOR_PAIRS.map((pair) => (
            <ColorTokenTile
              key={pair.token}
              token={pair.token}
              fg={pair.fg}
              value={values[pair.token]}
            />
          ))}
        </div>
      </DemoRow>
      <DemoRow label="Lines & focus" hint="Borders, input outlines, and the focus ring.">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
          {LINE_COLOR_TOKENS.map((token) => (
            <ColorTokenTile key={token} token={token} value={values[token]} />
          ))}
        </div>
      </DemoRow>
      <DemoRow label="Charts" hint="Use in ChartContainer configs as var(--chart-N).">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
          {CHART_COLOR_TOKENS.map((token) => (
            <ColorTokenTile key={token} token={token} value={values[token]} />
          ))}
        </div>
      </DemoRow>
      <SwatchRow
        label="Radius scale"
        hint="--radius is 0.375rem (6px); sm through 4xl derive from it by ±px offsets. rounded-lg is the default control radius."
      >
        {RADIUS_CLASSES.map((cls) => (
          <Swatch key={cls} label={cls}>
            <div className={cn("bg-muted border-border-accent size-12 border", cls)} />
          </Swatch>
        ))}
      </SwatchRow>
      <SwatchRow
        label="Corner cut"
        hint="Filled buttons (default, secondary, destructive) swap border-radius for the clip-path corner-cut signature: --btn-cut 8px by default, 5px on xs/sm sizes."
      >
        <Swatch label="btn-corner-cut" colors>
          <Button>Primary</Button>
        </Swatch>
        <Swatch label="--btn-cut: 5px" colors>
          <Button size="sm">Compact</Button>
        </Swatch>
      </SwatchRow>
      <SwatchRow
        label="Height ladder"
        hint="Boxed controls sharing a row must share a tier; h-8 is the default control height (docs/design-language.md)."
      >
        {HEIGHT_TIERS.map(({ cls, note }) => (
          <Swatch key={cls} label={`${cls} · ${note}`}>
            <div className={cn("bg-muted border-border-opaque w-14 rounded-md border", cls)} />
          </Swatch>
        ))}
      </SwatchRow>
      <DemoRow
        label="Type scale"
        hint="Pick a tier from docs/typography.md, never invent a size. h1/h2 carry font-heading (Chakra Petch); everything else keeps the default face. Measured sizes update with the viewport."
      >
        <div className="w-full space-y-3">
          {TYPE_TIERS.map((tier) => (
            <TypeSpecimen key={tier.role} role={tier.role} cls={tier.cls} note={tier.note} />
          ))}
        </div>
      </DemoRow>
    </DemoSection>
  );
}
