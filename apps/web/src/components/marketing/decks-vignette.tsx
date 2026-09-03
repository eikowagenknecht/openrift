import { CheckIcon, ChevronRightIcon, CircleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CardMiniRow } from "@/components/cards/card-mini-row";
import { Badge } from "@/components/ui/badge";
import { getDomainColor } from "@/lib/domain";
import { cn } from "@/lib/utils";

import { EnergyGlyph, PowerPips, Swap, Vignette } from "./vignette-parts";

const META_WIDTH = "w-16";

/**
 * Five rows off an Azir Unleashed list — an Emperor of the Sands legend over
 * Azir, Sovereign, which is what puts calm beside order in a deck named for a
 * single champion. Every card is real, and so are its rune cost, energy and
 * rarity. The vignette has no printing to draw art from, so `CardMiniRow` falls
 * back to its domain-tinted placeholder the way the app does for an art-less
 * printing.
 *
 * `Guards!` is the row the loop adds a copy to: the main deck reaches 39, and
 * the collection is left one copy behind.
 */
const DECK_ROWS = [
  {
    shortCode: "OGN-045",
    name: "Defy",
    rarity: "common",
    domain: "calm",
    energy: 1,
    power: 1,
    owned: 3,
    quantity: 3,
  },
  {
    shortCode: "UNL-039",
    name: "Soul Sword",
    rarity: "common",
    domain: "calm",
    energy: 1,
    power: 0,
    owned: 3,
    quantity: 3,
  },
  {
    shortCode: "OGN-213",
    name: "Hidden Blade",
    rarity: "common",
    domain: "order",
    energy: 2,
    power: 1,
    owned: 3,
    quantity: 3,
  },
] as const;

const TAIL_ROW = {
  shortCode: "UNL-176",
  name: "Vi, Peacekeeper",
  rarity: "rare",
  domain: "order",
  energy: 5,
  power: 1,
  owned: 1,
  quantity: 1,
} as const;

const ADDED_ROW = {
  shortCode: "SFD-154",
  name: "Guards!",
  rarity: "common",
  domain: "order",
  energy: 3,
  power: 0,
  owned: 1,
} as const;

// The stats band counts the champion alongside the main deck, so these columns
// run to 40 rather than the zone's 39. The 3 column is where the added copy
// lands, and it carries the count the list had before it — both totals average
// to the Ø 2.3 the heading prints (89/39 and 92/40), which is why the heading
// itself never swaps. The axis runs to 8 whatever the deck costs.
const ENERGY_CURVE: { energy: number; count: number; was?: number }[] = [
  { energy: 0, count: 0 },
  { energy: 1, count: 15 },
  { energy: 2, count: 13 },
  { energy: 3, count: 4, was: 3 },
  { energy: 4, count: 4 },
  { energy: 5, count: 1 },
  { energy: 6, count: 3 },
  { energy: 7, count: 0 },
  { energy: 8, count: 0 },
];

const CURVE_PEAK = 15;

// Height reserved above every column for its total, matching the 14px top
// margin the real chart leaves for the same labels.
const CURVE_LABEL_HEIGHT = "0.875rem";

/**
 * The split across the legend's two domains, in enum order. Counted as DomainBar
 * counts it: over the champion and main deck, and a dual-domain card for both
 * its domains — which is why the two segments overrun the 40 they divide by, and
 * why the bar clips them.
 */
const DOMAIN_SPLIT = [
  { domain: "calm", count: 23 },
  { domain: "order", count: 20 },
] as const;

const MAIN_DECK_SIZE = 39;

/** Main deck plus the champion, which is the figure the stats band prints. */
const STATS_DECK_SIZE = 40;

/** DeckFormatBadge's settled state: green outline, check, the format label. */
function SettledFormatBadge() {
  return (
    <Badge variant="outline" className="bg-success-soft border-success/30 text-success text-xs">
      <CheckIcon aria-hidden="true" />
      Constructed
    </Badge>
  );
}

/** DeckFormatBadge's invalid state: amber, the format label, the figure, the alert. */
function InvalidFormatBadge() {
  return (
    <Badge variant="outline" className="bg-warning-soft border-warning/40 text-warning text-xs">
      Constructed
      <span className="tabular-nums">· 55/56</span>
      <CircleAlertIcon aria-hidden="true" />
    </Badge>
  );
}

/** The zone's own count, green once it reaches the format's target. */
function ZoneCount({ quantity, complete }: { quantity: number; complete?: boolean }) {
  return (
    <span className={cn("tabular-nums", complete ? "text-success" : "text-muted-foreground")}>
      {quantity}/{MAIN_DECK_SIZE}
    </span>
  );
}

/** The owned/needed fraction, amber while the collection is short. */
function Ownership({ owned, needed }: { owned: number; needed: number }) {
  return (
    <span className={cn("tabular-nums", owned < needed ? "text-warning" : "text-muted-foreground")}>
      {owned}/{needed}
    </span>
  );
}

function DeckRow({
  shortCode,
  rarity,
  domain,
  name,
  quantity,
  power,
  energy,
  ownership,
}: {
  shortCode: string;
  rarity: string;
  domain: string;
  name: string;
  quantity: ReactNode;
  power: number;
  energy: number;
  ownership: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm sm:gap-2">
      <CardMiniRow
        className="self-stretch"
        domains={[domain]}
        rarity={rarity}
        shortCode={shortCode}
        metaClassName={META_WIDTH}
        hideMetaOnMobile
      />
      <span className="w-6 shrink-0 text-right tabular-nums">{quantity}</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <PowerPips power={power} domain={domain} />
      <EnergyGlyph energy={energy} />
      <span className="w-10 shrink-0 text-right text-xs">{ownership}</span>
    </li>
  );
}

/**
 * One count over its bar, sized against the tallest column. Label and bar are
 * one layer so the count always sits on the bar it belongs to — swapping the
 * bar alone would leave the label floating a step above it.
 * @returns The layer.
 */
function CurveBar({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("flex h-full flex-col justify-end", className)}>
      <span className="text-muted-foreground text-2xs h-3.5 text-center leading-none tabular-nums">
        {count > 0 && count}
      </span>
      <span
        className="bg-primary w-full"
        style={{ height: `calc((100% - ${CURVE_LABEL_HEIGHT}) * ${count / CURVE_PEAK})` }}
      />
    </span>
  );
}

/**
 * One column of the energy curve. A column given `was` grows on the shared
 * swap, so the chart agrees with the count in the zone header throughout the
 * loop.
 * @returns The column.
 */
function CurveColumn({ count, was }: { count: number; was?: number }) {
  const swaps = was !== undefined;
  return (
    <span className="relative flex h-full min-w-0 flex-1 flex-col">
      <CurveBar count={count} className={cn(swaps && "motion-safe:animate-vignette-now")} />
      {swaps && (
        <CurveBar
          count={was}
          className="motion-safe:animate-vignette-was absolute inset-0 opacity-0"
        />
      )}
    </span>
  );
}

/**
 * The deck overview's list mode: the format badge over one zone of the list,
 * with the stats band the sidebar carries underneath. The loop adds the copy
 * that completes the main deck — the count settles, the badge turns from the
 * build figure to a legal Constructed deck, the curve's 3 column grows, and the
 * collection is left a copy short of the list.
 * @returns The deck vignette.
 */
export function DecksVignette() {
  return (
    <Vignette>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Azir (Unleashed)</span>
        <Swap
          className="justify-items-end"
          was={<InvalidFormatBadge />}
          now={<SettledFormatBadge />}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex h-6 items-center gap-2 border-b">
          <span className="text-muted-foreground text-2xs font-semibold tracking-wide uppercase">
            Main Deck
          </span>
          <span className="ml-auto text-xs">
            <Swap
              className="justify-items-end"
              was={<ZoneCount quantity={MAIN_DECK_SIZE - 1} />}
              now={<ZoneCount quantity={MAIN_DECK_SIZE} complete />}
            />
          </span>
        </div>

        <ul className="flex flex-col">
          {DECK_ROWS.map((row) => (
            <DeckRow
              key={row.shortCode}
              shortCode={row.shortCode}
              rarity={row.rarity}
              domain={row.domain}
              name={row.name}
              quantity={`${row.quantity}×`}
              power={row.power}
              energy={row.energy}
              ownership={<Ownership owned={row.owned} needed={row.quantity} />}
            />
          ))}
          <DeckRow
            shortCode={ADDED_ROW.shortCode}
            rarity={ADDED_ROW.rarity}
            domain={ADDED_ROW.domain}
            name={ADDED_ROW.name}
            quantity={<Swap className="justify-items-end" was="1×" now="2×" />}
            power={ADDED_ROW.power}
            energy={ADDED_ROW.energy}
            ownership={
              <Swap
                className="justify-items-end"
                was={<Ownership owned={ADDED_ROW.owned} needed={1} />}
                now={<Ownership owned={ADDED_ROW.owned} needed={2} />}
              />
            }
          />
          <DeckRow
            shortCode={TAIL_ROW.shortCode}
            rarity={TAIL_ROW.rarity}
            domain={TAIL_ROW.domain}
            name={TAIL_ROW.name}
            quantity={`${TAIL_ROW.quantity}×`}
            power={TAIL_ROW.power}
            energy={TAIL_ROW.energy}
            ownership={<Ownership owned={TAIL_ROW.owned} needed={TAIL_ROW.quantity} />}
          />
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-muted-foreground flex h-6 items-center gap-1.5 border-b">
          <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 rotate-90" />
          <span className="text-2xs shrink-0 font-semibold tracking-wide uppercase">Stats</span>
          <span aria-hidden="true" className="mx-1 flex h-2.5 flex-1 overflow-hidden rounded-full">
            {DOMAIN_SPLIT.map((entry) => (
              <span
                key={entry.domain}
                className="h-full"
                style={{
                  width: `${(entry.count / STATS_DECK_SIZE) * 100}%`,
                  backgroundColor: getDomainColor(entry.domain),
                }}
              />
            ))}
          </span>
          <span className="shrink-0 text-xs tabular-nums">
            <Swap
              className="justify-items-end"
              was={`${STATS_DECK_SIZE - 1} cards`}
              now={`${STATS_DECK_SIZE} cards`}
            />
          </span>
        </div>

        <div>
          <div className="mb-1 flex items-center text-xs">
            <span className="font-medium">Energy</span>
            <span className="text-muted-foreground ml-auto">Ø 2.3</span>
          </div>
          <div className="flex h-24 items-end gap-1.5">
            {ENERGY_CURVE.map((bar) => (
              <CurveColumn key={bar.energy} count={bar.count} was={bar.was} />
            ))}
          </div>
          <div className="flex gap-1.5">
            {ENERGY_CURVE.map((bar) => (
              <span
                key={bar.energy}
                className="text-muted-foreground text-2xs min-w-0 flex-1 text-center tabular-nums"
              >
                {bar.energy}
              </span>
            ))}
          </div>
          <span className="text-muted-foreground text-2xs">Counts the main deck only.</span>
        </div>
      </div>
    </Vignette>
  );
}
