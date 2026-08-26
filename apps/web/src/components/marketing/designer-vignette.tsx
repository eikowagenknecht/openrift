import type { ReactNode } from "react";

import { DEFAULT_DOMAIN_COLORS } from "@/lib/domain";
import { cn } from "@/lib/utils";

import { Vignette, VignetteHeading } from "./vignette-parts";

const DOMAINS = ["fury", "calm", "mind", "body", "chaos", "order"] as const;

const PICKED_DOMAIN = "chaos";

const CARD_NAME = "Sir Pounce";
const CARD_EPITHET = "Lord of Naps";
const CARD_ENERGY = "4";
const CARD_MIGHT = "3";

// The strong-alpha diagonal CardArtThumb paints for an art-less card, on the
// domain the swatch row has picked.
const ART_FILL = `linear-gradient(135deg, ${DEFAULT_DOMAIN_COLORS[PICKED_DOMAIN]}cc, ${DEFAULT_DOMAIN_COLORS[PICKED_DOMAIN]}80)`;

// Input's frame, on a span: nothing in a miniature may be focusable.
const FAKE_INPUT =
  "border-input dark:bg-input/30 flex h-8 w-full items-center rounded-lg border bg-transparent px-2.5 text-sm";

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm leading-none font-medium">{label}</span>
      {children}
    </div>
  );
}

function DomainSwatches() {
  return (
    <span aria-hidden="true" className="flex flex-wrap gap-1">
      {DOMAINS.map((domain) => (
        <span
          key={domain}
          className={cn(
            "size-8 rounded-lg ring-inset",
            domain === PICKED_DOMAIN ? "ring-foreground/50 ring-2" : "ring-border ring-1",
          )}
          style={{ backgroundColor: DEFAULT_DOMAIN_COLORS[domain] }}
        />
      ))}
    </span>
  );
}

/**
 * The live preview at miniature scale: the placeholder card's own layering
 * (domain fill, a bottom scrim, the white energy and might glyphs, the title
 * band at 55%), reproduced rather than imported because the real preview
 * drags in the designer store and the full card renderer.
 */
function MiniCardPreview() {
  return (
    <span className="aspect-card relative block w-24 shrink-0 overflow-hidden rounded-lg bg-neutral-800 sm:w-28">
      <span aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: ART_FILL }} />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/85 via-black/55 to-transparent"
      />
      <span
        role="img"
        aria-label={`Energy ${CARD_ENERGY}`}
        className="font-numeric text-2xs absolute top-[5%] left-[6%] flex size-4 items-center justify-center rounded-full bg-white/70 font-semibold text-black ring-1 ring-black/70"
      >
        {CARD_ENERGY}
      </span>
      <span
        role="img"
        aria-label={`Might ${CARD_MIGHT}`}
        className="absolute top-[20%] left-[6%] flex size-4 items-center justify-center"
      >
        <span
          aria-hidden="true"
          className="absolute inset-[3px] rotate-45 bg-white/70 ring-1 ring-black/70"
        />
        <span className="font-numeric text-2xs relative font-semibold text-black">
          {CARD_MIGHT}
        </span>
      </span>
      <span className="font-display absolute inset-x-0 top-[52%] flex flex-col px-2 tracking-wide text-white">
        <span className="text-xs leading-tight font-semibold">{CARD_NAME}</span>
        <span className="text-2xs leading-tight uppercase italic">{CARD_EPITHET}</span>
      </span>
      <span aria-hidden="true" className="absolute inset-x-0 top-[68%] flex flex-col gap-1 px-2">
        <span className="h-1 w-full rounded-full bg-white/25" />
        <span className="h-1 w-4/5 rounded-full bg-white/25" />
        <span className="h-1 w-3/5 rounded-full bg-white/25" />
      </span>
    </span>
  );
}

/**
 * The card designer: the form on the left, the card it renders on the right,
 * the way the page lays them out from `lg` up.
 */
export function DesignerVignette() {
  return (
    <Vignette>
      <VignetteHeading>Card details</VignetteHeading>
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <ControlRow label="Name">
            <span className={FAKE_INPUT}>
              <span className="truncate">
                {CARD_NAME}, {CARD_EPITHET}
              </span>
            </span>
          </ControlRow>
          <ControlRow label="Domains">
            <DomainSwatches />
          </ControlRow>
          <div className="grid grid-cols-2 gap-3">
            <ControlRow label="Energy">
              <span className={cn(FAKE_INPUT, "tabular-nums")}>{CARD_ENERGY}</span>
            </ControlRow>
            <ControlRow label="Might">
              <span className={cn(FAKE_INPUT, "tabular-nums")}>{CARD_MIGHT}</span>
            </ControlRow>
          </div>
        </div>
        <MiniCardPreview />
      </div>
    </Vignette>
  );
}
