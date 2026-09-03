import { WellKnown } from "@openrift/shared";
import { useState } from "react";

import { SECTION_SCROLL_MARGIN } from "@/components/deck/deck-overview-tabs";
import { EnergyChart, PowerChart } from "@/components/deck/stats/energy-power-chart";
import { LensBar } from "@/components/deck/stats/lens-bar";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { InfoHint } from "@/components/ui/info-hint";
import { Pressable } from "@/components/ui/pressable";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckStats } from "@/hooks/use-deck-stats";
import type { useEnumOrders } from "@/hooks/use-enums";
import { useMeasuredWidth } from "@/hooks/use-measured-width";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { curveOutRate } from "@/lib/deck-curve-out";
import { formatChancePct } from "@/lib/deck-draw-odds";
import { oddsGroupPresets, oddsGroupRow } from "@/lib/deck-odds-groups";
import { NO_CARDS } from "@/lib/deck-overview-derive";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import {
  buildOwnershipRows,
  buildRarityByCardKey,
  buildRarityRows,
  OWNERSHIP_LENS_SERIES,
  ownershipFocusKeys,
  rarityFocusKeys,
  rarityLensSeries,
} from "@/lib/deck-stat-lenses";
import type { StatsFocus } from "@/lib/deck-stats-focus";
import { cardMatchesStatsFocus } from "@/lib/deck-stats-focus";
import { cn } from "@/lib/utils";
import type { StatsLens } from "@/stores/deck-builder-ui-store";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";

/** The printing the viewer owns for a card, while "show my printings" is on. */
type OwnedPrinting = ReturnType<DeckOwnershipData["ownedPrintingByCardId"]["get"]>;

/**
 * The deck's charts, under one collapsible header: the energy and power curves,
 * the type breakdown, and the rarity / collection lenses. Clicking a bar sets
 * the surface's stats focus, which dims the non-matching cards in the grid
 * below; every other chart then splits its own segments into the matching part
 * (lit) and the rest (faded), so a focus reads as a cross-filter.
 *
 * Rendered above the grid on desktop and below it on phones — one instance
 * either way, so `#deck-stats` deep links always land on it.
 *
 * @returns The stats band, or null for a deck with nothing to chart.
 */
export function DeckStatsBand({
  cards,
  stats,
  ownershipData,
  ownershipSegmentsByCardKey,
  ownedPrintingFor,
  enumLabels,
  enumOrders,
  statsFocus,
  applyStatsFocus,
  statsOpen,
  onStatsOpenChange,
}: {
  cards: DeckBuilderCard[];
  stats: ReturnType<typeof useDeckStats>;
  /** Absent on surfaces with no collection behind them — drops the rarity lens. */
  ownershipData?: DeckOwnershipData;
  /** Per-entry owned/other/missing split; absent until the band sources land. */
  ownershipSegmentsByCardKey?: ReadonlyMap<string, OwnershipBandSegments>;
  /** The printing a row stands for, so the rarity lens matches the list rows. */
  ownedPrintingFor: (cardId: string) => OwnedPrinting;
  enumLabels: ReturnType<typeof useEnumOrders>["labels"];
  enumOrders: ReturnType<typeof useEnumOrders>["orders"];
  /** The surface's active focus; the charts render it, they don't own it. */
  statsFocus: StatsFocus | null;
  /** Sets the focus, or clears it when the same bar is clicked again. */
  applyStatsFocus: (focus: StatsFocus) => void;
  /**
   * Whether the charts are expanded. Hydration-gated by the host, so SSR always
   * renders the band open — keep the gate there, not here.
   */
  statsOpen: boolean;
  onStatsOpenChange: (open: boolean) => void;
}) {
  const hasMultiTypeCards = cards.some(
    (card) =>
      (card.zone === WellKnown.deckZone.MAIN || card.zone === WellKnown.deckZone.CHAMPION) &&
      card.cardTypes.length > 1,
  );

  const hasStats =
    stats.energyCurve.length > 0 || stats.powerCurve.length > 0 || stats.typeBreakdown.length > 0;

  // Cards matching the active focus, run through the same stats pipeline. The
  // two charts the focus doesn't belong to use these counts to keep the
  // matching part of every column lit and fade the rest, so a focus reads as
  // a cross-filter rather than "the other charts are switched off".
  const focusedCards = statsFocus
    ? cards.filter((card) => cardMatchesStatsFocus(card, statsFocus))
    : NO_CARDS;
  const focusedStats = useDeckStats(focusedCards);

  // Rarity lens: the rarity each row stands for (owned printing while "show my
  // printings" is on, display printing otherwise — same resolution as the list
  // rows), one column per rarity in the rarity icons' colors.
  const rarityByCardKey = ownershipData
    ? buildRarityByCardKey(
        cards,
        (card) =>
          (
            ownedPrintingFor(card.cardId) ??
            ownershipData.byCardZone.get(`${card.cardId}:${card.zone}`)?.displayPrinting
          )?.rarity,
      )
    : undefined;
  const rarityRows = rarityByCardKey
    ? buildRarityRows(cards, rarityByCardKey, enumOrders.rarities, enumLabels.rarities)
    : undefined;
  const raritySeries = rarityRows ? rarityLensSeries(rarityRows, enumLabels.rarities) : [];
  const rarityHitRows =
    statsFocus && statsFocus.kind !== "rarity" && rarityByCardKey
      ? buildRarityRows(focusedCards, rarityByCardKey, enumOrders.rarities, enumLabels.rarities)
      : undefined;

  // Ownership lens: the deck's copies split owned / other printing / missing,
  // from the same per-entry segments the thumbnails' bands draw.
  const ownershipRows = ownershipSegmentsByCardKey
    ? buildOwnershipRows(cards, ownershipSegmentsByCardKey)
    : undefined;
  const ownershipHitRows =
    statsFocus && statsFocus.kind !== "ownership" && ownershipSegmentsByCardKey
      ? buildOwnershipRows(focusedCards, ownershipSegmentsByCardKey)
      : undefined;

  // Stats band layout: measured, not breakpoint-guessed. When the band is
  // wide enough for every chart on one row, all five render side by side
  // (energy/power on wider tracks). Otherwise the band keeps its three slots
  // and the third cycles Types / Rarity / Collection via the lens switcher.
  const [statsChartsEl, setStatsChartsEl] = useState<HTMLDivElement | null>(null);
  const statsChartsWidth = useMeasuredWidth(statsChartsEl);
  const rarityLensAvailable = rarityRows !== undefined && rarityRows.length > 0;
  const ownershipLensAvailable = ownershipRows !== undefined;
  const lensOptions: { key: StatsLens; label: string }[] = [
    ...(stats.typeBreakdown.length > 0 ? [{ key: "types" as const, label: "Types" }] : []),
    ...(rarityLensAvailable ? [{ key: "rarity" as const, label: "Rarity" }] : []),
    ...(ownershipLensAvailable ? [{ key: "ownership" as const, label: "Collection" }] : []),
  ];
  const storedStatsLens = useDeckBuilderUiStore((state) => state.statsLens);
  const setStatsLens = useDeckBuilderUiStore((state) => state.setStatsLens);
  // An unavailable stored choice (deck switch, signed-out view) falls back to
  // the first lens that exists rather than an empty slot.
  const statsLens = lensOptions.some((option) => option.key === storedStatsLens)
    ? storedStatsLens
    : (lensOptions[0]?.key ?? "types");
  // Per-chart minimum widths the one-row layout must fit (the curves need
  // room for their many columns, the categorical charts for three to five).
  const chartTracks = [
    { present: stats.energyCurve.length > 0, track: "1.5fr", minWidth: 260 },
    { present: stats.powerCurve.length > 0, track: "1.5fr", minWidth: 260 },
    { present: stats.typeBreakdown.length > 0, track: "1fr", minWidth: 170 },
    // Rarity and Collection render as thin bars and share one column.
    { present: rarityLensAvailable || ownershipLensAvailable, track: "1fr", minWidth: 200 },
  ].filter((chart) => chart.present);
  // Wide mode separates cells with a centered hairline: pr-5 + border + pl-5.
  const statsGap = 40;
  const wideMinWidth =
    chartTracks.reduce((sum, chart) => sum + chart.minWidth, 0) +
    (chartTracks.length - 1) * statsGap;
  const hasLensCharts = lensOptions.length > 1;
  const wideStats = hasLensCharts && statsChartsWidth >= wideMinWidth;

  const typesChart = (withHeading: boolean) =>
    stats.typeBreakdown.length > 0 ? (
      <TypeBreakdown
        data={stats.typeBreakdown}
        domains={stats.typeBreakdownDomains}
        revealDomainsOnHover
        showTotals
        onBarClick={(value) => applyStatsFocus({ kind: "type", value })}
        footnote={hasMultiTypeCards ? "A card with two types counts under both." : undefined}
        focusValue={statsFocus?.kind === "type" ? statsFocus.value : null}
        hitData={statsFocus && statsFocus.kind !== "type" ? focusedStats.typeBreakdown : undefined}
        hideHeading={!withHeading}
      />
    ) : null;

  const rarityChart = (withHeading: boolean) =>
    rarityRows && rarityLensAvailable ? (
      <LensBar
        title={withHeading ? "Rarity" : undefined}
        rows={rarityRows}
        series={raritySeries}
        onSegmentClick={(value) => {
          if (!rarityByCardKey) {
            return;
          }
          applyStatsFocus({
            kind: "rarity",
            value,
            cardKeys: rarityFocusKeys(cards, rarityByCardKey, value),
          });
        }}
        focusValue={statsFocus?.kind === "rarity" ? statsFocus.value : null}
        hitRows={rarityHitRows}
      />
    ) : null;

  const ownershipChart = (withHeading: boolean) =>
    ownershipRows ? (
      <LensBar
        title={withHeading ? "Collection" : undefined}
        rows={ownershipRows}
        series={OWNERSHIP_LENS_SERIES}
        footnote="Counts the main deck against your collection."
        onSegmentClick={(value) => {
          if (!ownershipSegmentsByCardKey) {
            return;
          }
          const ownershipClass = OWNERSHIP_LENS_SERIES.find((series) => series.key === value)?.key;
          if (!ownershipClass) {
            return;
          }
          applyStatsFocus({
            kind: "ownership",
            value: ownershipClass,
            cardKeys: ownershipFocusKeys(cards, ownershipSegmentsByCardKey, ownershipClass),
          });
        }}
        focusValue={statsFocus?.kind === "ownership" ? statsFocus.value : null}
        hitRows={ownershipHitRows}
      />
    ) : null;

  // The deck's curves and lenses, rendered bare (no cards): the band's
  // hairline header is the only chrome. The focused chart dims its
  // non-matching columns via focusValue; every other chart splits its
  // segments into the focus-matching part (lit) and the rest (faded).
  const energyChartNode =
    stats.energyCurve.length > 0 ? (
      <EnergyChart
        data={stats.energyCurve}
        stacks={stats.energyCurveStacks}
        average={stats.averageEnergy}
        // Domain color is Power's story (runes pay power); here the split
        // only shows on the hovered column, so the two curves read apart.
        revealDomainsOnHover
        footnote="Counts the main deck. Click a bar to see its cards."
        showTotals
        onBarClick={(value) => applyStatsFocus({ kind: "energy", value })}
        focusValue={statsFocus?.kind === "energy" ? statsFocus.value : null}
        hitData={statsFocus && statsFocus.kind !== "energy" ? focusedStats.energyCurve : undefined}
      />
    ) : null;

  const powerChartNode =
    stats.powerCurve.length > 0 ? (
      <PowerChart
        data={stats.powerCurve}
        stacks={stats.powerCurveStacks}
        average={stats.averagePower}
        showTotals
        onBarClick={(value) => applyStatsFocus({ kind: "power", value })}
        focusValue={statsFocus?.kind === "power" ? statsFocus.value : null}
        hitData={statsFocus && statsFocus.kind !== "power" ? focusedStats.powerCurve : undefined}
      />
    ) : null;

  // Wide mode's one-row cells, in track order, dropped where a chart has no
  // data — the track list above filters on the same conditions. The two lens
  // bars stack inside one cell, top-aligned against the taller charts.
  const lensBarsNode =
    rarityLensAvailable || ownershipLensAvailable ? (
      <div className="flex flex-col gap-4">
        {rarityChart(true)}
        {ownershipChart(true)}
      </div>
    ) : null;
  const wideCells = [
    { key: "energy", node: energyChartNode },
    { key: "power", node: powerChartNode },
    { key: "types", node: typesChart(true) },
    { key: "lenses", node: lensBarsNode },
  ].filter((cell) => cell.node !== null);

  // Narrow mode's third slot: the lens switcher, or the single remaining
  // chart when there's nothing to cycle through.
  const thirdSlotNode = hasLensCharts ? (
    <div>
      {/* Same grammar as the charts' own heading rows, with the active
          lens standing where the h4 would be. */}
      <div className="mb-1 flex items-center gap-3 text-xs">
        {lensOptions.map((option) => (
          <Pressable
            key={option.key}
            onClick={() => setStatsLens(option.key)}
            aria-pressed={statsLens === option.key}
            className={cn(
              "font-medium transition-colors",
              statsLens !== option.key && "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Pressable>
        ))}
      </div>
      {statsLens === "types"
        ? typesChart(false)
        : statsLens === "rarity"
          ? rarityChart(false)
          : ownershipChart(false)}
    </div>
  ) : (
    (typesChart(true) ?? rarityChart(true) ?? ownershipChart(true))
  );
  const narrowCells = [
    { key: "energy", node: energyChartNode },
    { key: "power", node: powerChartNode },
    { key: "slot", node: thirdSlotNode },
  ].filter((cell) => cell.node !== null);

  // The deck's curves and lenses, rendered bare (no cards): the band's
  // hairline header is the only chrome. The focused chart dims its
  // non-matching columns via focusValue; every other chart splits its
  // segments into the focus-matching part (lit) and the rest (faded).
  const statsCharts = (
    <div
      ref={setStatsChartsEl}
      className={cn("grid gap-y-4", !wideStats && "@lg:grid-cols-2 @3xl:grid-cols-3")}
      style={
        wideStats
          ? { gridTemplateColumns: chartTracks.map((chart) => chart.track).join(" ") }
          : undefined
      }
    >
      {wideStats
        ? wideCells.map((cell, index) => (
            <div
              key={cell.key}
              className={cn(
                "min-w-0",
                // Hairline dividers centered in the gaps — the frameless
                // charts otherwise run into each other on one row.
                index > 0 && "border-l pl-5",
                index < wideCells.length - 1 && "pr-5",
              )}
            >
              {cell.node}
            </div>
          ))
        : narrowCells.map((cell, index) => (
            <div
              key={cell.key}
              className={cn(
                "min-w-0",
                // Same dividers, applied only where the responsive grid puts
                // two cells side by side: the second cell borders from two
                // columns up, the third only in the three-column layout (at
                // two columns it starts its own row).
                index === 0 && "@lg:pr-5",
                index === 1 && "@lg:border-l @lg:pl-5 @3xl:pr-5",
                index === 2 && "@3xl:border-l @3xl:pl-5",
              )}
            >
              {cell.node}
            </div>
          ))}
    </div>
  );

  // Headline reliability figures, visible even with the charts collapsed:
  // turn-1 play odds from the existing opening-hand presets, and the
  // simulated curve-out rate through turn 3 (base rune economy, seeded so the
  // numbers are stable per deck). Both show going first / going second.
  const presets = oddsGroupPresets(cards, enumLabels.cardTypes);
  const turnOneFirst = presets.find((preset) => preset.key === "turn-one-first");
  const turnOneSecond = presets.find((preset) => preset.key === "turn-one-second");
  const turnOneFirstChance = turnOneFirst ? oddsGroupRow(cards, turnOneFirst).openingChance : null;
  const turnOneSecondChance = turnOneSecond
    ? oddsGroupRow(cards, turnOneSecond).openingChance
    : null;
  const curveOutFirst = curveOutRate(cards, { goingSecond: false });
  const curveOutSecond = curveOutRate(cards, { goingSecond: true });
  const headlineChips = (
    <div className="text-muted-foreground hidden items-center gap-3 text-xs tabular-nums @lg:flex">
      {turnOneFirstChance !== null && turnOneSecondChance !== null && (
        <span className="flex items-center gap-1">
          Turn-1 play {formatChancePct(turnOneFirstChance)} · {formatChancePct(turnOneSecondChance)}
          <InfoHint label="Turn-1 play" side="bottom">
            The chance your opening hand holds a turn-one play. First number: going first (a unit or
            gear at 2 energy or less). Second: going second (3 or less). Spells don&rsquo;t count
            &mdash; there&rsquo;s nothing to react to yet.
          </InfoHint>
        </span>
      )}
      {curveOutFirst !== null && curveOutSecond !== null && (
        <span className="flex items-center gap-1">
          Curve-out {formatChancePct(curveOutFirst)} · {formatChancePct(curveOutSecond)}
          <InfoHint label="Curve-out" side="bottom">
            How often you can play at least one card on each of turns 1&ndash;3 &mdash; first number
            going first, second going second. A card needs energy plus power runes, and you channel
            two runes a turn (one extra on your first turn going second).
          </InfoHint>
        </span>
      )}
    </div>
  );

  if (!hasStats) {
    return null;
  }

  // The collapsible band hosting the charts; rendered above the grid on
  // desktop and below it on phones (one instance either way).
  return (
    <div
      id="deck-stats"
      style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}
      className="flex flex-col gap-3"
    >
      <div className="flex h-6 items-center gap-2 border-b">
        <ExpandToggle
          expanded={statsOpen}
          chevronClassName="size-3.5"
          onClick={() => onStatsOpenChange(!statsOpen)}
          className="text-muted-foreground hover:text-foreground flex-1 transition-colors"
        >
          <span className="text-2xs font-semibold tracking-wide uppercase">Stats</span>
        </ExpandToggle>
        {headlineChips}
      </div>
      {statsOpen && statsCharts}
    </div>
  );
}
