import { Link } from "@tanstack/react-router";
import {
  BookOpenIcon,
  BoxIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CheckIcon,
  FileUpIcon,
  HandHeartIcon,
  HeartIcon,
  LayersIcon,
  PackageIcon,
  SearchIcon,
  SparklesIcon,
  SquareIcon,
  SwordsIcon,
  TrendingUpIcon,
  UploadIcon,
  UserMinusIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountPill } from "@/components/ui/count-pill";
import { IconChip } from "@/components/ui/icon-chip";
import { toggleVariants } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserAvatar } from "@/components/user-avatar";
import { formatPrice, formatPriceEur, priceColorClass } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

import {
  EnergyGlyph,
  MiniCardArt,
  PowerPips,
  StripGlyph,
  Swap,
  Vignette,
  VignetteHeading,
} from "./vignette-parts";

export { DiscordVignette } from "./discord-vignette";

/**
 * Miniatures for the /features and landing sections. Every string, control
 * shape and number here is the app's own — see the UI fidelity dossier. Where
 * a real primitive cannot be imported (filter bar, card cell, recharts) the
 * miniature reproduces its markup rather than inventing a simpler one.
 */

// A connected ToggleGroup spacing={0} item: square corners except at the ends.
const CLUSTER_ITEM = cn(
  toggleVariants({ variant: "outline", size: "sm" }),
  "rounded-none border-l-0 px-2 first:rounded-l-lg first:border-l last:rounded-r-lg",
);

// FILTER_TRIGGER_ACTIVE_CLASS: a neutral fill, never a primary one.
const FILTER_ACTIVE = "bg-muted dark:bg-muted";

// Catalog shares of the live per-facet splits, measured from the DB. The
// vignette has no facet counts, so the filtered figure is derived from the
// real total rather than invented.
const DOMAINS = [
  { slug: "fury", label: "Fury", share: 0.169 },
  { slug: "calm", label: "Calm", share: 0.17 },
  { slug: "mind", label: "Mind", share: 0.169 },
  { slug: "body", label: "Body", share: 0.172 },
  { slug: "chaos", label: "Chaos", share: 0.168 },
  { slug: "order", label: "Order", share: 0.174 },
] as const;

const RARITIES = [
  { slug: "common", label: "Common", share: 0.291 },
  { slug: "uncommon", label: "Uncommon", share: 0.279 },
  { slug: "rare", label: "Rare", share: 0.274 },
  { slug: "epic", label: "Epic", share: 0.161 },
  { slug: "showcase", label: "Showcase", share: 0.202 },
] as const;

export interface TaggedThumbnail {
  url: string;
  rarity: string;
  domains: string[];
}

type CatalogFilter = { axis: "rarity" | "domain"; slug: string } | null;

function matches(thumb: TaggedThumbnail, filter: CatalogFilter): boolean {
  if (filter === null) {
    return true;
  }
  if (filter.axis === "rarity") {
    return thumb.rarity === filter.slug;
  }
  return thumb.domains.includes(filter.slug);
}

export function CatalogVignette({
  thumbnails,
  cardCount,
}: {
  /** The full tagged daily sample; the grid shows the first eight matches. */
  thumbnails: TaggedThumbnail[];
  cardCount?: number;
}) {
  const [filter, setFilter] = useState<CatalogFilter>(null);
  const active =
    filter === null
      ? undefined
      : filter.axis === "rarity"
        ? RARITIES.find((entry) => entry.slug === filter.slug)
        : DOMAINS.find((entry) => entry.slug === filter.slug);
  const shown = thumbnails.filter((thumb) => matches(thumb, filter)).slice(0, 8);
  const filtered = active && cardCount ? Math.round(cardCount * active.share) : undefined;
  const count =
    cardCount === undefined
      ? undefined
      : filtered === undefined
        ? `${cardCount} cards`
        : `${filtered} / ${cardCount} cards`;
  const search =
    filter === null
      ? {}
      : filter.axis === "rarity"
        ? { rarities: [filter.slug] }
        : { domains: [filter.slug] };

  return (
    <Vignette>
      <Link
        to="/cards"
        search={search}
        aria-label={active ? `Browse ${active.label} cards` : "Browse the catalog"}
        className="border-input hover:bg-muted/40 focus-visible:ring-ring flex h-8 w-full items-center gap-2 rounded-lg border px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="text-muted-foreground flex-1 truncate text-sm">Search...</span>
        {count && <span className="text-muted-foreground text-xs font-normal">{count}</span>}
      </Link>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Domain filter"
          value={filter?.axis === "domain" ? [filter.slug] : []}
          onValueChange={(next) => {
            const slug = (next as string[]).at(-1);
            setFilter(slug === undefined ? null : { axis: "domain", slug });
          }}
        >
          {DOMAINS.map((entry) => (
            <ToggleGroupItem
              key={entry.slug}
              value={entry.slug}
              aria-label={entry.label}
              disabled={!thumbnails.some((thumb) => thumb.domains.includes(entry.slug))}
            >
              <CardIcon src={getFilterIconPath("domains", entry.slug) ?? ""} className="size-4" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Rarity filter"
          value={filter?.axis === "rarity" ? [filter.slug] : []}
          onValueChange={(next) => {
            const slug = (next as string[]).at(-1);
            setFilter(slug === undefined ? null : { axis: "rarity", slug });
          }}
        >
          {RARITIES.map((entry) => (
            <ToggleGroupItem
              key={entry.slug}
              value={entry.slug}
              aria-label={entry.label}
              disabled={!thumbnails.some((thumb) => thumb.rarity === entry.slug)}
            >
              <CardIcon src={getFilterIconPath("rarities", entry.slug) ?? ""} className="size-4" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {filter !== null && (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Clear all filters"
            aria-label="Clear all filters"
            className="ml-auto"
            onClick={() => setFilter(null)}
          >
            <XIcon />
          </Button>
        )}
      </div>

      <div
        key={filter === null ? "all" : `${filter.axis}:${filter.slug}`}
        className="motion-safe:animate-in motion-safe:fade-in-0 grid grid-cols-4 gap-2 duration-300"
      >
        {shown.map(({ url }) => (
          <div key={url} className="flex flex-col">
            <div className="relative z-30 mb-1 flex h-5 items-center justify-center">
              <CountPill variant="ghost" className="opacity-50">
                <PackageIcon className="size-3" aria-hidden="true" />0
              </CountPill>
            </div>
            <div className="group rounded-lg p-0.75">
              <MiniCardArt url={url} className="hover:ring-primary/60 hover:ring-2" />
            </div>
          </div>
        ))}
      </div>
    </Vignette>
  );
}

const COLLECTION_ROWS = [
  { icon: BookOpenIcon, name: "Binder", count: 412 },
  { icon: BoxIcon, name: "Azir Order", count: 60 },
  { icon: BookOpenIcon, name: "Trade box", count: 96 },
] as const;

// PrintingVariantLabel's order: the language chip leads, then the code, then
// the variant words.
const COPY_ROWS = [
  { key: "en-standard", label: "EN · OGN-213 · Standard", condition: "Near Mint", onLoan: false },
  { key: "en-foil", label: "EN · OGN-213 · Foil", condition: "Light Played", onLoan: true },
  { key: "sc-standard", label: "SC · OGN-213 · Standard", condition: null, onLoan: false },
] as const;

export function CollectionsVignette() {
  return (
    <Vignette>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
          <LayersIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">All Cards</span>
          <Badge variant="ghost" className="text-2xs ml-auto">
            568
          </Badge>
        </div>
        <VignetteHeading>Collections</VignetteHeading>
        {COLLECTION_ROWS.map((row) => (
          <div key={row.name} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
            <row.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{row.name}</span>
            <Badge variant="ghost" className="text-2xs ml-auto">
              {row.count}
            </Badge>
          </div>
        ))}
      </div>
      <div className="border-border/60 flex flex-col gap-2 border-t pt-4">
        <VignetteHeading>Copies of Hidden Blade</VignetteHeading>
        <ul className="flex flex-col gap-1.5 text-sm">
          {COPY_ROWS.map((row) => (
            <li key={row.key} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              {row.condition ? (
                <Badge variant="secondary">{row.condition}</Badge>
              ) : (
                <span className="text-muted-foreground">No details yet</span>
              )}
              {row.onLoan && (
                <HandHeartIcon
                  className="text-muted-foreground size-3.5 shrink-0"
                  aria-label="On loan"
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </Vignette>
  );
}

const WISHLIST_ROWS = [
  { name: "Hidden Blade", rule: "2" },
  { name: "Guards!", rule: "3" },
] as const;

/** RuleSourceBadge: a sparkle plus the rule-contributed quantity. */
function RuleSourceBadge({ children }: { children: ReactNode }) {
  return (
    <Badge
      variant="subtle"
      className="rounded-md border-0 bg-transparent"
      title="Added by a list rule"
    >
      <SparklesIcon aria-hidden="true" />
      {children}
    </Badge>
  );
}

export function ListsVignette() {
  return (
    <Vignette>
      <div className="flex flex-col gap-2">
        <span className="font-heading font-medium">Dynamic rules</span>
        <p className="text-muted-foreground text-sm">
          Automatically want every card that matches these filters.
        </p>
        <span className="border-border flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm">
          <span>A playset of everything</span>
          <span className="text-muted-foreground font-normal">
            Want a full playset of everything, minus the copies you already own.
          </span>
        </span>
      </div>
      <div className="border-border/60 flex flex-col gap-2.5 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Playset gaps</span>
          <SparklesIcon className="text-primary size-3.5" role="img" aria-label="Dynamic list">
            <title>Kept up to date by a rule</title>
          </SparklesIcon>
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <HeartIcon className="size-3.5" aria-hidden="true" />
            Wishlist
          </span>
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <SquareIcon className="size-3.5" aria-hidden="true" />
            <Swap
              was={<span className="tabular-nums">21 Cards</span>}
              now={<span className="tabular-nums">20 Cards</span>}
            />
          </span>
        </div>
        <ul className="flex flex-col gap-1.5 text-sm">
          {WISHLIST_ROWS.map((row) => (
            <li key={row.name} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <RuleSourceBadge>{row.rule}</RuleSourceBadge>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">Azir, Sovereign</span>
            <RuleSourceBadge>
              <Swap
                was={<span className="tabular-nums">3</span>}
                now={<span className="tabular-nums">2</span>}
              />
            </RuleSourceBadge>
          </li>
        </ul>
      </div>
    </Vignette>
  );
}

const IMPORT_BADGES = [
  { label: "337 ready", variant: "success" as const },
  { label: "4 to verify", variant: "warning" as const },
  { label: "2 need attention", variant: "destructive" as const },
];

export function ImportVignette() {
  return (
    <Vignette>
      <div className="border-input flex min-h-24 flex-col rounded-lg border bg-transparent px-3 py-2 font-mono text-sm">
        <Swap
          className="w-full"
          was={
            <span className="text-muted-foreground">
              Paste CSV data or a plain text list here...
            </span>
          }
          now={
            <span className="flex flex-col">
              <span>3 Hidden Blade</span>
              <span>3 Guards!</span>
              <span>2 Azir, Sovereign</span>
              <span className="text-muted-foreground">...</span>
            </span>
          }
        />
      </div>
      <div className="flex items-center gap-3">
        <span className={buttonVariants()}>
          <UploadIcon className="size-4" aria-hidden="true" />
          Parse
        </span>
        <span className="text-muted-foreground text-sm">or</span>
        <span className={buttonVariants({ variant: "outline" })}>
          <FileUpIcon className="size-4" aria-hidden="true" />
          Upload file
        </span>
      </div>
      <div className="border-border/60 motion-safe:animate-vignette-now flex flex-col gap-3 border-t pt-4">
        <span className="font-heading font-medium">Import Preview</span>
        <div className="flex flex-wrap gap-1.5">
          {IMPORT_BADGES.map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
        <span className={cn(buttonVariants(), "w-fit")}>Import 412 copies</span>
      </div>
    </Vignette>
  );
}

// Default marketplaceOrder: CardTrader, TCGplayer, Cardmarket. Each chip is
// logo plus price and nothing else — the app never names the marketplace here.
const BUY_CHIPS = [
  { marketplace: "cardtrader" as const, price: formatPriceEur(3.65), value: 3.65 },
  { marketplace: "tcgplayer" as const, price: formatPrice(4.52), value: 4.52 },
  { marketplace: "cardmarket" as const, price: formatPriceEur(3.8), value: 3.8 },
];

const PRICE_RANGES = ["7D", "30D", "90D", "All"] as const;
const ACTIVE_PRICE_RANGE = "30D";

const CHART_POINTS = [
  [44, 78],
  [67, 74],
  [90, 80],
  [113, 68],
  [136, 71],
  [159, 60],
  [182, 63],
  [205, 52],
  [228, 55],
  [251, 44],
  [274, 40],
  [296, 34],
] as const;

const CHART_LINE = CHART_POINTS.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(
  " ",
);
const CHART_AREA = `${CHART_LINE} L296,92 L44,92 Z`;
// Length of the polyline above, so the draw-in starts fully retracted.
const CHART_LENGTH = 290;

const CHART_DAYS = ["2026-07-27", "2026-08-10", "2026-08-24"] as const;

export function PricesVignette() {
  return (
    <Vignette>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Azir, Sovereign</span>
        <span className="text-muted-foreground text-xs">SFD-177/221</span>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-muted-foreground text-sm">Buy on</span>
        {BUY_CHIPS.map((chip) => (
          <span
            key={chip.marketplace}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <MarketplaceIcon marketplace={chip.marketplace} />
            <span className={cn("font-semibold", priceColorClass(chip.value))}>{chip.price}</span>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex" role="group" aria-label="Time range">
          {PRICE_RANGES.map((range) => (
            <span
              key={range}
              className={cn(CLUSTER_ITEM, range === ACTIVE_PRICE_RANGE && FILTER_ACTIVE)}
            >
              {range}
            </span>
          ))}
        </span>
        <span className="text-muted-foreground text-sm">Cardmarket</span>
        <span
          className="flex items-center gap-0.5 text-sm text-emerald-600 tabular-nums dark:text-emerald-400"
          title="+12% over 30 days"
        >
          <TrendingUpIcon className="size-3" aria-hidden="true" />
          12%
        </span>
      </div>
      <svg viewBox="0 0 300 110" className="w-full" role="img" aria-label="Price history">
        <defs>
          <linearGradient id="vignette-price-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <g stroke="var(--border)" strokeDasharray="3 3" strokeWidth="1">
          {[20, 46, 72, 92].map((y) => (
            <line key={y} x1="40" x2="300" y1={y} y2={y} />
          ))}
          {[113, 182, 251].map((x) => (
            <line key={x} x1={x} x2={x} y1="8" y2="92" />
          ))}
        </g>
        <path
          d={CHART_AREA}
          fill="url(#vignette-price-fill)"
          className="motion-safe:animate-vignette-now"
        />
        <path
          d={CHART_LINE}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeDasharray={CHART_LENGTH}
          className="motion-safe:animate-vignette-draw"
          style={{ "--vignette-draw-length": String(CHART_LENGTH) } as CSSProperties}
        />
        <g className="fill-muted-foreground" fontSize={7}>
          <text x="0" y="23">
            4,00 €
          </text>
          <text x="0" y="49">
            3,50 €
          </text>
          <text x="0" y="75">
            3,00 €
          </text>
          {CHART_DAYS.map((day, index) => (
            <text key={day} x={40 + index * 104} y="106">
              {day}
            </text>
          ))}
        </g>
      </svg>
    </Vignette>
  );
}

const GROUP_MEMBERS = [
  {
    name: "Alice",
    action: "Your move · 2 to answer, 1 to hand over, 3 to receive",
    suggestions: "3 possible trades",
    facts: "2 waiting on them · shares 3 lists",
    footer: "4 trades done · +2 in other groups",
  },
  {
    name: "Thogrim",
    action: null,
    suggestions: "1 possible trade in another group",
    facts: "shares 2 lists",
    footer: "1 trade done",
  },
] as const;

export function GroupsVignette() {
  return (
    <Vignette>
      <VignetteHeading>Thursday store crew</VignetteHeading>
      <div className="flex flex-col gap-3">
        {GROUP_MEMBERS.map((member) => (
          <Card key={member.name} className="gap-1.5 p-4">
            <div className="flex items-center gap-2.5">
              <UserAvatar name={member.name} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{member.name}</span>
              <ChevronRightIcon
                className="text-muted-foreground/40 size-4 shrink-0"
                aria-hidden="true"
              />
            </div>
            {member.action && (
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {member.action}
              </p>
            )}
            <p className="flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-500">
              <SparklesIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {member.suggestions}
            </p>
            <p className="text-muted-foreground text-sm">{member.facts}</p>
            <p className="text-muted-foreground text-xs">{member.footer}</p>
          </Card>
        ))}
      </div>
    </Vignette>
  );
}

const DECK_ROWS = [
  { name: "Hidden Blade", energy: 2, quantity: 3, power: 1 },
  { name: "Guards!", energy: 3, quantity: 3, power: 0 },
] as const;

// Main deck, cost 0 through 7. Sums to the 39 the Constructed main zone wants,
// and averages the Ø 3.3 the chart heading prints.
const ENERGY_CURVE = [
  { energy: 0, count: 0 },
  { energy: 1, count: 4 },
  { energy: 2, count: 9 },
  { energy: 3, count: 10 },
  { energy: 4, count: 7 },
  { energy: 5, count: 5 },
  { energy: 6, count: 3 },
  { energy: 7, count: 1 },
] as const;

const CURVE_PEAK = 10;

/** DeckFormatBadge's settled state: green outline, check, the format label. */
function SettledFormatBadge() {
  return (
    <Badge
      variant="outline"
      className="border-green-600/30 bg-green-600/10 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400"
    >
      <CheckIcon aria-hidden="true" />
      Constructed
    </Badge>
  );
}

/** DeckFormatBadge's invalid state: amber, the format label, the figure, the alert. */
function InvalidFormatBadge() {
  return (
    <Badge
      variant="outline"
      className="border-amber-600/30 bg-amber-600/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
    >
      Constructed
      <span className="tabular-nums">· 55/56</span>
      <CircleAlertIcon aria-hidden="true" />
    </Badge>
  );
}

function DeckRow({
  name,
  quantity,
  power,
  energy,
  shortfall,
}: {
  name: string;
  quantity: ReactNode;
  power: number;
  energy: number;
  shortfall?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5 rounded px-1 py-1 text-sm">
      <StripGlyph>−</StripGlyph>
      <span className="w-4 shrink-0 text-right text-xs font-medium tabular-nums">{quantity}</span>
      <StripGlyph>+</StripGlyph>
      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
      {shortfall}
      <PowerPips power={power} domain="order" />
      <EnergyGlyph energy={energy} />
    </li>
  );
}

export function DecksVignette() {
  return (
    <Vignette>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Azir Order</span>
        <Swap
          className="justify-items-end"
          was={<InvalidFormatBadge />}
          now={<SettledFormatBadge />}
        />
      </div>
      <ul className="flex flex-col">
        {DECK_ROWS.map((row) => (
          <DeckRow
            key={row.name}
            name={row.name}
            quantity={`${row.quantity}×`}
            power={row.power}
            energy={row.energy}
          />
        ))}
        <DeckRow
          name="Vi, Peacekeeper"
          quantity={<Swap className="justify-items-end" was="2×" now="3×" />}
          power={1}
          energy={5}
          shortfall={
            // The shortfall is ownership, not legality: it only appears once
            // the third copy is in the deck and the collection is one short.
            <Swap
              was={null}
              now={
                <span
                  className="text-2xs shrink-0 text-amber-600 tabular-nums dark:text-amber-500"
                  title="You have 2 of 3 copies"
                >
                  2/3
                </span>
              }
            />
          }
        />
      </ul>
      <div className="border-border/60 flex flex-col gap-1 border-t pt-4">
        <div className="mb-1 flex items-center text-xs">
          <span className="font-medium">Energy</span>
          <span className="text-muted-foreground ml-auto">Ø 3.3</span>
        </div>
        <div className="flex h-28 items-end gap-1.5">
          {ENERGY_CURVE.map((bar) => (
            <span
              key={bar.energy}
              className="bg-primary min-w-0 flex-1"
              style={{ height: `${(bar.count / CURVE_PEAK) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex gap-1.5">
          {ENERGY_CURVE.map((bar) => (
            <span
              key={bar.energy}
              className="text-muted-foreground min-w-0 flex-1 text-center text-xs tabular-nums"
            >
              {bar.energy}
            </span>
          ))}
        </div>
        <span className="text-muted-foreground text-2xs">Counts the main deck only.</span>
      </div>
    </Vignette>
  );
}

const PAIRINGS = [
  {
    label: "Match 1",
    status: "Reported",
    sides: [
      { name: "Alice", score: "2", points: "+3" },
      { name: "Thogrim", score: "1", points: "+0" },
    ],
  },
  {
    label: "Match 2",
    status: "1 of 2 in",
    sides: [
      { name: "Nour", score: "2", points: null },
      { name: "Ravi", score: null, points: null },
    ],
  },
] as const;

export function TournamentsVignette() {
  return (
    <Vignette>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading font-medium">Round 3</span>
        <Badge variant="warning">Reporting</Badge>
        <span className="text-muted-foreground text-sm">2 matches · 1 bye</span>
      </div>
      <div className="flex flex-col gap-3">
        {PAIRINGS.map((pairing) => (
          <Card key={pairing.label} className="gap-3 p-4">
            <div className="flex items-center gap-2">
              <IconChip
                icon={SwordsIcon}
                tone={pairing.status === "Reported" ? "green" : "neutral"}
                size="sm"
                shape="round"
              />
              <span className="font-heading font-medium">{pairing.label}</span>
              <span className="ml-auto">
                <Badge variant={pairing.status === "Reported" ? "success" : "warning"}>
                  {pairing.status}
                </Badge>
              </span>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {pairing.sides.map((side) => (
                <li key={side.name} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {side.score && (
                      <Badge variant="secondary" className="shrink-0 tabular-nums">
                        {side.score}
                      </Badge>
                    )}
                    <UserAvatar name={side.name} size="sm" />
                    <span className="truncate font-medium">{side.name}</span>
                  </span>
                  {side.points && (
                    <span className="shrink-0 font-semibold tabular-nums">{side.points}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
          <UserMinusIcon className="size-4" aria-hidden="true" />
          Byes
        </span>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar name="Sina" size="sm" />
            <span className="truncate font-medium">Sina</span>
          </span>
          <span className="font-semibold tabular-nums">+3 bye</span>
        </div>
      </div>
    </Vignette>
  );
}
