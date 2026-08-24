import { Link } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowDownUpIcon,
  BookOpenIcon,
  CheckIcon,
  PackageOpenIcon,
  PaintbrushIcon,
  SearchIcon,
  TrophyIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// The hero CTAs' 45° corner-cut, scaled to each surface: 16px on vignette
// frames, 12px on the small toolbox tiles. Sharing the cut across surfaces is
// what turns it from a button style into the app's shape signature.
const FRAME_CLIP = "polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%)";
const TILE_CLIP = "polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)";

function VignetteFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // Gold hairline as a clipped wrapper showing through 1px of padding —
    // clip-path slices a normal border off the diagonal edge. No shadow: the
    // clip would cut it, and the hairline provides the definition instead.
    // The inner layer must be OPAQUE: any translucency lets the wrapper's
    // gold tint the whole frame instead of reading as a 1px line.
    <div className="bg-border-accent p-px" style={{ clipPath: FRAME_CLIP }}>
      <div className={cn("bg-card p-4", className)} style={{ clipPath: FRAME_CLIP }}>
        {children}
      </div>
    </div>
  );
}

/** @returns The catalog vignette: a search field over real card thumbnails. */
function CatalogVignette({
  thumbnailUrls,
  cardCount,
}: {
  thumbnailUrls: string[];
  cardCount?: number;
}) {
  return (
    <VignetteFrame className="flex flex-col gap-3">
      <div className="border-input bg-background text-muted-foreground flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
        <SearchIcon className="size-4" />
        <span>{cardCount ? `Search ${cardCount.toLocaleString()} cards…` : "Search cards…"}</span>
      </div>
      {thumbnailUrls.length > 0 && (
        <div className="flex gap-2">
          {thumbnailUrls.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              loading="lazy"
              draggable={false}
              className="aspect-card border-border/60 w-0 min-w-0 flex-1 rounded-md border object-cover"
            />
          ))}
        </div>
      )}
      {/* Filter axes, not values: the thumbnails are the random daily sample,
          so value chips ("Epic", "Fury") would visibly contradict them. */}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">Set</Badge>
        <Badge variant="secondary">Rarity</Badge>
        <Badge variant="secondary">Domain</Badge>
        <Badge variant="secondary">Finish</Badge>
        <Badge variant="secondary">Language</Badge>
      </div>
    </VignetteFrame>
  );
}

/** @returns The price vignette: one card's three marketplace prices plus a history sparkline. */
function PriceVignette() {
  return (
    <VignetteFrame className="flex flex-col gap-2.5">
      <span className="text-sm font-medium">Azir, Sovereign</span>
      <ul className="flex flex-col gap-1 text-sm">
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">TCGplayer</span>
          <span className="tabular-nums">$3.42</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">Cardmarket</span>
          <span className="tabular-nums">€2.95</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">CardTrader</span>
          <span className="tabular-nums">€3.10</span>
        </li>
      </ul>
      <div className="flex items-end gap-2">
        <svg
          viewBox="0 0 100 28"
          className="text-primary h-7 min-w-0 flex-1"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points="0,22 14,20 28,23 42,16 56,17 70,12 84,14 100,8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="text-muted-foreground text-2xs shrink-0">30 days</span>
      </div>
    </VignetteFrame>
  );
}

/** @returns The lists vignette: a rule flowing into an auto-updated wishlist. */
function ListsVignette() {
  return (
    <VignetteFrame className="flex flex-col items-center gap-2">
      <Badge variant="outline">Rule: every card missing for a playset</Badge>
      <ArrowDownIcon className="text-muted-foreground size-4" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="font-medium">Wishlist</span>
        <span className="text-muted-foreground tabular-nums">21 cards</span>
        <Badge variant="secondary">auto-updated</Badge>
      </div>
    </VignetteFrame>
  );
}

const GROUP_MEMBERS = ["L", "M", "S"] as const;

/** @returns The groups vignette: member avatars over trade-match lines. */
function GroupsVignette() {
  return (
    <VignetteFrame className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          {GROUP_MEMBERS.map((initial) => (
            <span
              key={initial}
              className="bg-muted text-muted-foreground border-card flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold"
            >
              {initial}
            </span>
          ))}
        </div>
        <span className="text-muted-foreground text-sm">Thursday store crew</span>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        <li className="flex items-center gap-2">
          <span className="size-1.5 shrink-0 rounded-full bg-green-600 dark:bg-green-400" />
          Max has 3 cards from your wishlist
        </li>
        <li className="flex items-center gap-2">
          <span className="size-1.5 shrink-0 rounded-full bg-green-600 dark:bg-green-400" />
          Lena wants 2 of your spares
        </li>
      </ul>
    </VignetteFrame>
  );
}

// Real rows from an actual Azir list (the main deck genuinely sums to 40),
// with their true power costs and domain (all three are mono-Order).
// The footer's "1 card missing" refers to the second Vi, Peacekeeper copy.
const DECK_ROWS = [
  { name: "Hidden Blade", energy: 2, quantity: 3, power: 1 },
  { name: "Guards!", energy: 3, quantity: 3, power: 0 },
  { name: "Vi, Peacekeeper", energy: 5, quantity: 2, power: 1 },
] as const;

const ORDER_DOMAIN_ICON = "/images/domains/order.webp";

/**
 * Miniature of the deck builder's sidebar row (DeckCardRow): quantity on the
 * left as "3×", name, energy in the white circular glyph on the right.
 * @returns The deck vignette.
 */
function DeckVignette() {
  return (
    <VignetteFrame className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Azir UNL</span>
        <Badge
          variant="outline"
          className="border-green-600/30 bg-green-600/10 text-xs text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400"
        >
          <CheckIcon className="size-3" />
          Legal · 40/40
        </Badge>
      </div>
      <ul className="flex flex-col gap-1">
        {DECK_ROWS.map((row) => (
          <li key={row.name} className="flex items-center gap-1.5 text-sm">
            <span className="w-4 shrink-0 text-right text-xs font-medium tabular-nums">
              {row.quantity}×
            </span>
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            {/* Power pips: one domain icon per power point, like
                PowerDomainIcon in deck-card-row.tsx. */}
            {row.power > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
                {Array.from({ length: row.power }, (_, pipIndex) => (
                  <img
                    key={pipIndex}
                    src={ORDER_DOMAIN_ICON}
                    alt="Order"
                    className="inline size-3"
                  />
                ))}
              </span>
            )}
            {/* Matches EnergyGlyph in deck-card-row.tsx. */}
            <span className="text-2xs flex size-4 shrink-0 items-center justify-center rounded-full bg-white leading-none font-bold text-[#013951]">
              {row.energy}
            </span>
          </li>
        ))}
      </ul>
      {/* Resolves the amber marker: the deck is legal, the player is just
          short one physical copy. */}
      <div className="text-muted-foreground border-border/60 flex items-center justify-between border-t pt-2 text-xs">
        <span>1 card missing from your collection</span>
        <span className="tabular-nums">€2.40 to complete</span>
      </div>
    </VignetteFrame>
  );
}

const TOOLBOX_TILES = [
  { icon: PackageOpenIcon, label: "Pack opener", to: "/pack-opener" },
  { icon: PaintbrushIcon, label: "Card designer", to: "/card-designer" },
  { icon: BookOpenIcon, label: "Rules reference", to: "/rules" },
  { icon: TrophyIcon, label: "Tournaments & deck check", to: "/tournaments" },
  { icon: ArrowDownUpIcon, label: "Import & CSV export", to: "/collections/import" },
] as const;

/**
 * The landing page's feature section: five alternating text-plus-vignette
 * rows for the differentiating features, then a compact toolbox strip for
 * the utilities. Vignettes are small illustrations built from the app's real
 * primitives (badges, validation colors, marketplace names) so the section
 * shows the product instead of describing it.
 * @returns The feature showcase section.
 */
export function FeatureShowcase({
  thumbnailUrls,
  cardCount,
}: {
  /** Card thumbnails for the catalog vignette (reuse the landing-summary payload). */
  thumbnailUrls?: string[];
  cardCount?: number;
}) {
  const features = [
    {
      title: "Every card, every printing",
      description:
        "Almost every English card and promo, many Chinese printings, deep filters, and full text search.",
      to: "/cards",
      vignette: (
        <CatalogVignette thumbnailUrls={thumbnailUrls?.slice(0, 4) ?? []} cardCount={cardCount} />
      ),
    },
    {
      title: "Prices, side by side",
      description:
        "Daily prices from TCGplayer, Cardmarket, and CardTrader on every printing, with history charts.",
      to: "/cards",
      vignette: <PriceVignette />,
    },
    {
      title: "Collections, wishlists, tradelists",
      description:
        "Sort cards into any number of collections (a binder, a deck box, cards lent out), and let rules keep your wishlists and tradelists current for you.",
      to: "/collections",
      vignette: <ListsVignette />,
    },
    {
      title: "Private groups",
      description:
        "Trade matching with your group: see who has what you need. Trades happen in person.",
      to: "/groups",
      vignette: <GroupsVignette />,
    },
    {
      title: "Advanced deck building",
      description:
        "Validated against the official rules or fully freeform, with energy curves, Piltover-compatible deck codes, matchup plans, and share links that unfurl into a visual decklist.",
      to: "/decks",
      vignette: <DeckVignette />,
    },
  ] as const;

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-12 md:py-16">
      {features.map((feature, index) => (
        <Link
          key={feature.title}
          to={feature.to}
          className="hover:bg-background/60 group grid items-center gap-5 rounded-2xl p-4 transition-colors sm:p-6 lg:grid-cols-2 lg:gap-10"
        >
          <div className={cn("flex flex-col gap-2", index % 2 === 1 && "lg:order-2")}>
            <Heading level={2}>{feature.title}</Heading>
            {/* Signature detail in place of the old tile icons: a short gold
                rule, same accent as the frame hairlines and CTA outline. */}
            <span aria-hidden="true" className="bg-border-accent h-px w-8" />
            <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
          </div>
          <div className={cn(index % 2 === 1 && "lg:order-1")}>{feature.vignette}</div>
        </Link>
      ))}

      <div className="mt-6 flex flex-col gap-4 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <Heading level={2}>And a full toolbox</Heading>
          <span aria-hidden="true" className="bg-border-accent h-px w-8" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TOOLBOX_TILES.map((tile) => (
            // Same clipped-wrapper hairline as VignetteFrame, at tile scale
            // and in the plain border color so the strip stays quieter than
            // the gold-lined vignettes above.
            <span key={tile.label} className="bg-border block p-px" style={{ clipPath: TILE_CLIP }}>
              <Link
                to={tile.to}
                className="bg-card hover:bg-secondary flex h-full flex-col items-center gap-2 p-4 text-center transition-colors"
                style={{ clipPath: TILE_CLIP }}
              >
                <tile.icon className="text-primary size-5" aria-hidden="true" />
                <span className="text-sm leading-tight">{tile.label}</span>
              </Link>
            </span>
          ))}
        </div>
        <p className="text-muted-foreground/70 text-center text-sm">Open source and free.</p>
      </div>
    </section>
  );
}
