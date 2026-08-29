import { marketplaceLabel } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  BookOpenIcon,
  BoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircle2Icon,
  FileUpIcon,
  HeartIcon,
  InboxIcon,
  LayersIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  SquareIcon,
  SwordsIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  UploadIcon,
  UserMinusIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { TIME_RANGES } from "@/components/cards/price-history-chart-constants";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountPill } from "@/components/ui/count-pill";
import { IconChip } from "@/components/ui/icon-chip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserAvatar } from "@/components/user-avatar";
import { formatterForMarketplace, priceColorClass } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { percentChange } from "@/lib/price-trend";
import { cn } from "@/lib/utils";

import {
  ArtStrip,
  MiniCardArt,
  StripGlyph,
  Swap,
  Vignette,
  VignetteHeading,
} from "./vignette-parts";

export { DiscordVignette } from "./discord-vignette";
export { DecksVignette } from "./decks-vignette";

/**
 * Miniatures for the /features and landing sections. Every string, control
 * shape and number here is the app's own — see the UI fidelity dossier. Where
 * a real primitive cannot be imported (filter bar, card cell, recharts) the
 * miniature reproduces its markup rather than inventing a simpler one.
 */

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
  // The sample comes from a client query, so SSR has nothing to judge a facet
  // by. Greying every chip there and un-greying them on arrival is a hydration
  // mismatch on the `disabled` attribute.
  const hasSample = thumbnails.length > 0;
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
          {DOMAINS.map((entry) => {
            const icon = getFilterIconPath("domains", entry.slug);
            return (
              <ToggleGroupItem
                key={entry.slug}
                value={entry.slug}
                aria-label={entry.label}
                disabled={
                  hasSample && !thumbnails.some((thumb) => thumb.domains.includes(entry.slug))
                }
              >
                {icon && <CardIcon src={icon} className="size-4" />}
              </ToggleGroupItem>
            );
          })}
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
          {RARITIES.map((entry) => {
            const icon = getFilterIconPath("rarities", entry.slug);
            return (
              <ToggleGroupItem
                key={entry.slug}
                value={entry.slug}
                aria-label={entry.label}
                disabled={hasSample && !thumbnails.some((thumb) => thumb.rarity === entry.slug)}
              >
                {icon && <CardIcon src={icon} className="size-4" />}
              </ToggleGroupItem>
            );
          })}
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

// Three cards leave the inbox over the cycle: two to the binder, one to the
// deck box. Every state is arithmetically honest — the two ends both total the
// 842 All Cards claims, and that total never moves, because sorting a card into
// a collection does not change what you own.
const COLLECTION_ROWS = [
  {
    icon: BookOpenIcon,
    name: "Main binder",
    was: 411,
    count: 413,
    active: true,
    receives: "a" as const,
  },
  { icon: BookOpenIcon, name: "Storage drawer", count: 220, active: false, receives: null },
  { icon: BookOpenIcon, name: "Shoe box", count: 148, active: false, receives: null },
  { icon: BoxIcon, name: "Azir Order", was: 60, count: 61, active: false, receives: "b" as const },
] as const;

/** When each row's count ticks over, and when its drop ring flashes. */
const DROP_PHASE = {
  a: {
    until: "motion-safe:animate-collect-until-a",
    from: "motion-safe:animate-collect-from-a",
    ring: "motion-safe:animate-collect-drop-a",
  },
  b: {
    until: "motion-safe:animate-collect-until-b",
    from: "motion-safe:animate-collect-from-b",
    ring: "motion-safe:animate-collect-drop-b",
  },
} as const;

const SIDEBAR_ROW = "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm";
// SidebarMenuButton's data-active styling; one row always carries it.
const SIDEBAR_ROW_ACTIVE = "bg-sidebar-accent text-sidebar-accent-foreground font-medium";

const COPY_LOCATIONS = [
  { name: "Main binder", count: 2 },
  { name: "Storage drawer", count: 1 },
  { name: "Azir Order", count: 1 },
] as const;

/**
 * A sidebar count that ticks over when its drop lands. Both states share one
 * grid cell, like {@link Swap}, but on the sort cycle rather than the shared
 * 9s one.
 */
function DropCount({ was, now, phase }: { was: number; now: number; phase: "a" | "b" }) {
  return (
    <span className="inline-grid justify-items-end">
      <span
        className={cn("col-start-1 row-start-1 tabular-nums opacity-0", DROP_PHASE[phase].until)}
      >
        {was}
      </span>
      <span className={cn("col-start-1 row-start-1 tabular-nums", DROP_PHASE[phase].from)}>
        {now}
      </span>
    </span>
  );
}

/** CardDragGhost's own width and fan offsets, which are fractions of it. */
const GHOST_WIDTH = 36;
const GHOST_FAN = [
  { x: 0, y: 0, rotate: 0 },
  { x: 0.107, y: -0.036, rotate: 6 },
  { x: 0.214, y: -0.018, rotate: 12 },
] as const;

/**
 * The ghost that rides the cursor during a real drag: the front card, the rest
 * fanned behind it, a lone one tilted instead, and the count badge CardDragGhost
 * shows above a single card. Wider than a row on purpose, so it reads as
 * hovering over the list the way the real overlay does.
 */
function DragGhost({ urls, className }: { urls: readonly string[]; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-8 z-20 w-9 -translate-y-1/2"
    >
      <span className={cn("relative block opacity-0", urls.length <= 1 && "rotate-3", className)}>
        {urls.toReversed().map((url, reversedIndex) => {
          const index = urls.length - 1 - reversedIndex;
          const offset = GHOST_FAN[index] ?? GHOST_FAN[0];
          return (
            <span
              key={url}
              className={cn("w-full", index > 0 ? "absolute top-0 left-0" : "relative block")}
              style={{
                transform: `translate(${offset.x * GHOST_WIDTH}px, ${offset.y * GHOST_WIDTH}px) rotate(${offset.rotate}deg)`,
                zIndex: urls.length - index,
              }}
            >
              <MiniCardArt url={url} className="shadow-lg" />
            </span>
          );
        })}
        {urls.length > 1 && (
          <span className="bg-primary text-primary-foreground text-2xs absolute -top-1.5 -right-1.5 z-10 flex size-4 items-center justify-center rounded-full font-bold shadow">
            {urls.length}
          </span>
        )}
      </span>
    </span>
  );
}

/** DroppableCollection's hover ring, flashed on the row taking a drop. */
function DropRing({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-primary/10 ring-primary/60 pointer-events-none absolute inset-0 rounded-md opacity-0 ring-2 ring-inset",
        className,
      )}
    />
  );
}

/** A variant-locations row's resting [- count +] cluster. */
function CopyStepper({ count, strong }: { count: number; strong?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <span
        aria-hidden="true"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
      >
        <MinusIcon />
      </span>
      <span
        className={cn(
          "text-muted-foreground w-5 text-center tabular-nums",
          strong && "font-medium",
        )}
      >
        {count}
      </span>
      <span
        aria-hidden="true"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
      >
        <PlusIcon />
      </span>
    </div>
  );
}

// PrintingVariantLabel's order: the language chip leads, then the code, then
// the variant words.
function VariantHeaderRow({
  label,
  count,
  expanded,
  className,
}: {
  label: string;
  count: number;
  expanded?: boolean;
  className?: string;
}) {
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  return (
    <div
      className={cn(
        "bg-muted/50 flex items-center gap-2 rounded-md px-1.5 py-0.5 text-sm",
        className,
      )}
    >
      <div className="flex flex-1 items-center gap-1.5 whitespace-nowrap">
        <Chevron className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        <span className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
          {label}
        </span>
      </div>
      <CopyStepper count={count} strong />
    </div>
  );
}

export function CollectionsVignette({ thumbnailUrls }: { thumbnailUrls: string[] }) {
  const ghosts = thumbnailUrls.slice(0, 3);
  return (
    <Vignette>
      <div className="flex flex-col gap-1">
        <div className={SIDEBAR_ROW}>
          <LayersIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">All Cards</span>
          <Badge variant="ghost" className="text-2xs ml-auto">
            842
          </Badge>
        </div>
        <VignetteHeading>Collections</VignetteHeading>
        <div className={cn(SIDEBAR_ROW, "relative")}>
          <InboxIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Inbox</span>
          {/* At zero the real sidebar drops the badge rather than showing a 0,
              so a cleared inbox is what both animated states resolve to. */}
          <span className="ml-auto inline-grid justify-items-end">
            <Badge
              variant="default"
              className="text-2xs motion-safe:animate-collect-until-a col-start-1 row-start-1 opacity-0"
            >
              3
            </Badge>
            <Badge
              variant="default"
              className="text-2xs motion-safe:animate-collect-between col-start-1 row-start-1 opacity-0"
            >
              1
            </Badge>
          </span>
          {ghosts.length === 3 && (
            <>
              <DragGhost urls={ghosts.slice(0, 2)} className="motion-safe:animate-collect-fly-a" />
              <DragGhost urls={ghosts.slice(2, 3)} className="motion-safe:animate-collect-fly-b" />
            </>
          )}
        </div>
        {COLLECTION_ROWS.map((row) => (
          <div
            key={row.name}
            className={cn(SIDEBAR_ROW, "relative", row.active && SIDEBAR_ROW_ACTIVE)}
          >
            {row.receives !== null && <DropRing className={DROP_PHASE[row.receives].ring} />}
            <row.icon className="relative size-4 shrink-0" aria-hidden="true" />
            <span className="relative flex-1 truncate">{row.name}</span>
            <Badge variant="ghost" className="text-2xs relative ml-auto">
              {row.receives === null ? (
                row.count
              ) : (
                <DropCount was={row.was} now={row.count} phase={row.receives} />
              )}
            </Badge>
          </div>
        ))}
      </div>
      <div className="border-border/60 flex flex-col gap-1 border-t pt-4">
        <VignetteHeading>Copies of Hidden Blade</VignetteHeading>
        <VariantHeaderRow label="EN · OGN-213 · Standard" count={4} expanded />
        {COPY_LOCATIONS.map((row) => (
          <div
            key={row.name}
            className="flex items-center gap-2 rounded-md py-0.5 pr-1.5 pl-4 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            <CopyStepper count={row.count} />
          </div>
        ))}
        <VariantHeaderRow label="EN · OGN-213 · Foil" count={1} className="mt-1.5" />
      </div>
    </Vignette>
  );
}

// Origins commons, so Rule 1 below can actually be what put them on the list.
const WISHLIST_ROWS = [
  { name: "Hidden Blade", rule: "2" },
  { name: "Legion Rearguard", rule: "3" },
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

// CONTROL_WIDTH from rule-filter-editor.tsx: every criterion, the quantity mode
// and the combine mode share one trigger, which is what makes the editor read as
// a stack of interchangeable rows.
const RULE_CONTROL =
  "border-input dark:bg-input/30 flex h-8 items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap";

function RuleControl({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(RULE_CONTROL, "w-44", className)}>
      <span className="truncate">{children}</span>
      <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
    </span>
  );
}

/** FilterRow: the criterion on the left, its control on the right. Wraps on phones. */
function RuleRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </span>
  );
}

/** A checked Switch, at the geometry Switch renders (h-[18.4px] w-8, size-4 thumb). */
function RuleSwitch() {
  return (
    <span className="bg-primary inline-flex h-[18.4px] w-8 shrink-0 items-center rounded-full border border-transparent">
      <span className="bg-background dark:bg-primary-foreground block size-4 translate-x-[calc(100%-2px)] rounded-full" />
    </span>
  );
}

/** QuantityControl: the mode select (w-36) beside its amount input (w-20). */
function QuantityControl({ mode, amount }: { mode: string; amount: string }) {
  return (
    <span className="flex items-center gap-2">
      <RuleControl className="w-36">{mode}</RuleControl>
      <span className={cn(RULE_CONTROL, "w-20 tabular-nums")}>{amount}</span>
    </span>
  );
}

/**
 * A list total that ticks over as the completed row drops out. Stacked in one
 * grid cell like {@link Swap}, but on the lists cycle rather than the shared 9s
 * one, so the number never moves before the row it is counting.
 */
function ListsCount({ was, now }: { was: string; now: string }) {
  return (
    <span className="inline-grid justify-items-start tabular-nums">
      <span className="motion-safe:animate-lists-count-was col-start-1 row-start-1 opacity-0">
        {was}
      </span>
      <span className="motion-safe:animate-lists-count-now col-start-1 row-start-1">{now}</span>
    </span>
  );
}

function RuleBlock({
  title,
  count,
  children,
}: {
  title: string;
  count: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
      <span className="flex items-center justify-between">
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-muted-foreground text-xs">{count}</span>
        </span>
        <StripGlyph>
          <Trash2Icon className="size-4" />
        </StripGlyph>
      </span>
      {children}
    </div>
  );
}

export function ListsVignette() {
  return (
    <Vignette>
      <div className="flex flex-col gap-1">
        <span className="font-heading font-medium">Dynamic rules</span>
        <p className="text-muted-foreground text-sm">
          Automatically want every card that matches these filters.
        </p>
      </div>
      <RuleBlock
        title="Rule 1"
        count={<ListsCount was="missing 214 cards" now="missing 213 cards" />}
      >
        <RuleRow label="Sets">
          <RuleControl>Origins</RuleControl>
        </RuleRow>
        <RuleRow label="Languages">
          <RuleControl>English</RuleControl>
        </RuleRow>
        {/* The signed summary an exclude-only row collapses to. */}
        <RuleRow label="Finishes">
          <RuleControl>&minus;Metal</RuleControl>
        </RuleRow>
        <RuleRow label="Want quantity">
          <QuantityControl mode="Playset &times;" amount="1" />
        </RuleRow>
        <RuleRow label="Only what I'm missing">
          <RuleSwitch />
        </RuleRow>
      </RuleBlock>
      <div className="border-border/60 flex flex-col gap-2.5 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Playset gaps</span>
          <span title="Kept up to date by a rule" className="flex shrink-0 items-center">
            <SparklesIcon className="text-primary size-3.5" aria-hidden="true" />
            <span className="sr-only">Dynamic list</span>
          </span>
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <HeartIcon className="size-3.5" aria-hidden="true" />
            Wishlist
          </span>
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <SquareIcon className="size-3.5" aria-hidden="true" />
            <ListsCount was="214 Cards" now="213 Cards" />
          </span>
        </div>
        <ul className="flex flex-col text-sm">
          {/* The row's last copy lands, it goes green, and the rule drops it off
              the list. Rows below close the gap as its height collapses. */}
          <li className="motion-safe:animate-lists-row relative h-0 overflow-hidden opacity-0">
            <span
              aria-hidden="true"
              className="motion-safe:animate-lists-land bg-primary/10 ring-primary/60 pointer-events-none absolute inset-x-0 inset-y-[1px] rounded-md opacity-0 ring-2 ring-inset"
            />
            <span className="relative flex items-center gap-2 py-[3px]">
              <span className="min-w-0 flex-1 truncate">Playful Phantom</span>
              <span className="inline-grid justify-items-end">
                <span className="motion-safe:animate-lists-owned-was col-start-1 row-start-1 opacity-0">
                  <RuleSourceBadge>
                    <span className="tabular-nums">1</span>
                  </RuleSourceBadge>
                </span>
                <span className="motion-safe:animate-lists-owned-now col-start-1 row-start-1">
                  <CountPill variant="success">
                    <CheckCircle2Icon className="size-3" aria-hidden="true" />
                    Full Playset
                  </CountPill>
                </span>
              </span>
            </span>
          </li>
          {WISHLIST_ROWS.map((row) => (
            <li key={row.name} className="flex items-center gap-2 py-[3px]">
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <RuleSourceBadge>{row.rule}</RuleSourceBadge>
            </li>
          ))}
          <li className="flex items-center gap-2 py-[3px]">
            <span className="min-w-0 flex-1 truncate">Solari Shieldbearer</span>
            <RuleSourceBadge>3</RuleSourceBadge>
          </li>
        </ul>
        {/* Static: the completed row leaves the total and the shown rows alike,
            so the remainder between them never moves. */}
        <span className="text-muted-foreground text-xs">210 more</span>
      </div>
    </Vignette>
  );
}

// Every row resolves exactly: OGN-213 is a common (normal finish), SFD-154-Foil
// carries the suffix, and SFD-148a is a showcase, which isAlwaysFoilRarity
// reads as foil. Name-only input never matches exactly, so the source is a CSV.
const IMPORT_CSV_LINES = [
  "Variant Number,Card Name,Set,Rarity,Quantity,Language",
  "OGN-213,Hidden Blade,Origins,common,4,English",
  "SFD-154-Foil,Guards!,Spiritforged,common,3,English",
  'SFD-148a,"Draven, Audacious",Spiritforged,showcase,2,English',
];

const IMPORT_MATCHES = [
  { quantity: 4, name: "Hidden Blade", code: "OGN-213", specialties: null },
  { quantity: 3, name: "Guards!", code: "SFD-154", specialties: "Foil" },
  { quantity: 2, name: "Draven, Audacious", code: "SFD-148a", specialties: "Foil · Alt Art" },
];

export function ImportVignette() {
  return (
    <Vignette>
      <div className="border-input flex min-h-24 flex-col overflow-hidden rounded-lg border bg-transparent px-3 py-2 font-mono text-xs">
        <Swap
          className="w-full"
          was={
            <span className="text-muted-foreground">
              Paste CSV data or a plain text list here...
            </span>
          }
          now={
            <span className="flex flex-col">
              {IMPORT_CSV_LINES.map((line, index) => (
                <span
                  key={line}
                  className={cn("whitespace-nowrap", index === 0 && "text-muted-foreground")}
                >
                  {line}
                </span>
              ))}
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
        <div className="flex flex-col">
          {IMPORT_MATCHES.map((match) => (
            <span key={match.code} className="flex items-center gap-3 py-1 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground tabular-nums">{match.quantity}&times;</span>{" "}
                <span className="font-medium">{match.name}</span>
                <span className="text-muted-foreground ml-1.5 text-xs">{match.code}</span>
                {match.specialties && (
                  <span className="text-muted-foreground ml-1.5 text-xs">{match.specialties}</span>
                )}
              </span>
              <CheckCircle2Icon
                className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            </span>
          ))}
          <span className="text-muted-foreground py-1 text-xs">219 more</span>
        </div>
        <span className={cn(buttonVariants(), "w-fit")}>Import 412 copies</span>
      </div>
    </Vignette>
  );
}

// Default marketplaceOrder: CardTrader, TCGplayer, Cardmarket.
const PRICE_SOURCES = [
  { marketplace: "cardtrader" as const, price: 3.65, phase: 0.6, swing: 0.9, rate: 0.02 },
  { marketplace: "tcgplayer" as const, price: 4.52, phase: 2.2, swing: 1.4, rate: -0.014 },
  { marketplace: "cardmarket" as const, price: 3.8, phase: 4.1, swing: 1.1, rate: 0.011 },
];

// TIME_RANGES, minus the `all` entry's days: 0 sentinel, which the real chart
// resolves against the printing's own span.
const PRICE_RANGES = TIME_RANGES.map((range) => ({
  ...range,
  days: range.days === 0 ? 210 : range.days,
}));

// The plot box inside the 300x110 viewBox, and the pixel gap between the three
// gridlines the y labels sit on.
const PLOT = { left: 44, right: 296, top: 20, bottom: 92, step: 26 };
const SAMPLE_COUNT = 12;
// Anchors the x labels. A constant rather than today, so the server and the
// client render the same dates.
const PRICE_END_DAY = Date.parse("2026-08-24T00:00:00Z");

const TICK_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25];

/**
 * A price series for one marketplace over one window, ending on the price the
 * buy row shows. Two sines rather than a random walk, so every render draws the
 * same line, and the drift grows with the square root of the window, so a wider
 * one moves further without running away.
 * @returns `SAMPLE_COUNT` values, oldest first.
 */
function priceSeries(source: (typeof PRICE_SOURCES)[number], days: number): number[] {
  const drift = source.price * source.rate * Math.sqrt(days);
  const raw = Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const t = index / (SAMPLE_COUNT - 1);
    const wobble = Math.sin(source.phase + t * 7.5) + 0.5 * Math.sin(source.phase * 1.7 + t * 17.3);
    return source.price - drift * (1 - t) + source.price * 0.012 * source.swing * wobble;
  });
  // oxlint-disable-next-line no-non-null-assertion -- SAMPLE_COUNT is a positive literal
  const shift = source.price - raw.at(-1)!;
  return raw.map((value) => value + shift);
}

/** @returns The smallest tick step whose three gridlines contain the whole series. */
function tickStep(min: number, max: number): number {
  return TICK_STEPS.find((step) => Math.ceil(max / step) * step - 2 * step <= min) ?? 50;
}

/** @returns A `YYYY-MM-DD` day, `daysAgo` before the anchor the chart ends on. */
function chartDay(daysAgo: number): string {
  return new Date(PRICE_END_DAY - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export function PricesVignette() {
  const [source, setSource] = useState(PRICE_SOURCES[2]);
  const [range, setRange] = useState(PRICE_RANGES[1]);

  const format = formatterForMarketplace(source.marketplace);
  const values = priceSeries(source, range.days);
  const step = tickStep(Math.min(...values), Math.max(...values));
  const topTick = Math.ceil(Math.max(...values) / step) * step;

  const points = values.map((value, index) => [
    PLOT.left + (index / (SAMPLE_COUNT - 1)) * (PLOT.right - PLOT.left),
    PLOT.top + ((topTick - value) / step) * PLOT.step,
  ]);
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L${PLOT.right},${PLOT.bottom} L${PLOT.left},${PLOT.bottom} Z`;
  // Measured rather than fixed, so the draw-in starts fully retracted whichever
  // series is on screen.
  const length = points.reduce(
    (total, [x, y], index) =>
      index === 0 ? total : total + Math.hypot(x - points[index - 1][0], y - points[index - 1][1]),
    0,
  );

  const pctChange = percentChange(values);
  const isUp = pctChange > 0;

  return (
    <Vignette>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Azir, Sovereign</span>
        <span className="text-muted-foreground text-xs">SFD-177/221</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <VignetteHeading>Buy on</VignetteHeading>
        <div className="divide-border border-border grid grid-cols-3 divide-x rounded-lg border">
          {PRICE_SOURCES.map((entry) => (
            <span key={entry.marketplace} className="flex flex-col items-center gap-1 px-2 py-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <MarketplaceIcon marketplace={entry.marketplace} />
                {marketplaceLabel(entry.marketplace)}
              </span>
              <span className={cn("font-semibold tabular-nums", priceColorClass(entry.price))}>
                {formatterForMarketplace(entry.marketplace)(entry.price)}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Time range"
          value={[range.value]}
          onValueChange={([next]) => {
            const match = PRICE_RANGES.find((entry) => entry.value === next);
            if (match) {
              setRange(match);
            }
          }}
        >
          {PRICE_RANGES.map((entry) => (
            <ToggleGroupItem key={entry.value} value={entry.value}>
              {entry.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
          {marketplaceLabel(source.marketplace)}
          {pctChange !== 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium tabular-nums",
                isUp
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            >
              {isUp ? (
                <TrendingUpIcon className="size-3" aria-hidden="true" />
              ) : (
                <TrendingDownIcon className="size-3" aria-hidden="true" />
              )}
              {Math.abs(pctChange)}%
            </span>
          )}
        </span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Price source"
          className="ml-auto"
          value={[source.marketplace]}
          onValueChange={([next]) => {
            const match = PRICE_SOURCES.find((entry) => entry.marketplace === next);
            if (match) {
              setSource(match);
            }
          }}
        >
          {PRICE_SOURCES.map((entry) => (
            <ToggleGroupItem
              key={entry.marketplace}
              value={entry.marketplace}
              aria-label={marketplaceLabel(entry.marketplace)}
            >
              <MarketplaceIcon marketplace={entry.marketplace} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
          key={`${source.marketplace}-${range.value}-area`}
          d={area}
          fill="url(#vignette-price-fill)"
          className="motion-safe:animate-vignette-now"
        />
        <path
          key={`${source.marketplace}-${range.value}-line`}
          d={line}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeDasharray={length}
          className="motion-safe:animate-vignette-draw"
          style={{ "--vignette-draw-length": String(length) } as CSSProperties}
        />
        <g className="fill-muted-foreground" fontSize={7}>
          {[0, 1, 2].map((index) => (
            <text key={index} x="0" y={23 + index * PLOT.step}>
              {format(topTick - index * step)}
            </text>
          ))}
          {[range.days, Math.round(range.days / 2), 0].map((daysAgo, index) => (
            <text key={daysAgo} x={40 + index * 104} y="106">
              {chartDay(daysAgo)}
            </text>
          ))}
        </g>
      </svg>
    </Vignette>
  );
}

const GROUP_CARDS = [
  {
    name: "Thursday store crew",
    members: ["Alice", "Mira", "Nour", "Ravi"],
    extraMembers: 4,
    waiting: "2 trade requests",
    canGet: 9,
    canGetExtra: 5,
    theydWant: 5,
    theydWantExtra: 3,
    volume: "12 cards traded in the last 30 days",
    active: true,
  },
  {
    name: "Bothfeld Rift Club",
    members: ["Sina", "Jonas"],
    extraMembers: 1,
    waiting: null,
    canGet: 3,
    canGetExtra: 1,
    theydWant: null,
    theydWantExtra: 0,
    volume: "No trades in the last 30 days",
    active: false,
  },
] as const;

/**
 * The groups index: one card per group, leading with the cards you could
 * actually move there and how busy the group has been. Mirrors
 * `groups-index-page.tsx`, which is where this section's action link lands.
 * @returns The groups vignette.
 */
export function GroupsVignette({ thumbnailUrls }: { thumbnailUrls: string[] }) {
  return (
    <Vignette>
      <VignetteHeading>Your groups</VignetteHeading>
      <div className="flex flex-col gap-3">
        {GROUP_CARDS.map((group, index) => (
          <Card key={group.name} className="gap-2.5 p-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
              <span className="flex shrink-0 items-center -space-x-1">
                {group.members.map((member) => (
                  <UserAvatar
                    key={member}
                    name={member}
                    size="sm"
                    className="bg-card ring-card ring-2"
                  />
                ))}
                <span className="text-muted-foreground pl-3 text-xs tabular-nums">
                  +{group.extraMembers}
                </span>
              </span>
            </div>
            {group.waiting && <Badge className="self-start">{group.waiting}</Badge>}
            <div className="flex min-w-0 items-center gap-2.5">
              <ArtStrip
                urls={thumbnailUrls.slice(index * 3, index * 3 + 3)}
                extra={group.canGetExtra}
              />
              <span className="text-muted-foreground min-w-0 truncate text-sm">
                <span className="font-medium text-green-700 dark:text-green-500">
                  {group.canGet}
                </span>{" "}
                you could get
              </span>
            </div>
            {group.theydWant !== null && (
              <div className="flex min-w-0 items-center gap-2.5">
                <ArtStrip urls={thumbnailUrls.slice(6, 8)} extra={group.theydWantExtra} />
                <span className="text-muted-foreground min-w-0 truncate text-sm">
                  <span className="font-medium text-green-700 dark:text-green-500">
                    {group.theydWant}
                  </span>{" "}
                  they&apos;d want
                </span>
              </div>
            )}
            <p className="text-muted-foreground flex items-center gap-1.5 pt-0.5 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  group.active ? "bg-green-600 dark:bg-green-500" : "bg-muted-foreground/50",
                )}
              />
              {group.volume}
            </p>
          </Card>
        ))}
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
      { name: "Mira", score: "1", points: "+0" },
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
