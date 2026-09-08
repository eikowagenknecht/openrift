import { Link } from "@tanstack/react-router";
import { PackageIcon, SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { Button } from "@/components/ui/button";
import { CountPill } from "@/components/ui/count-pill";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getFilterIconPath } from "@/lib/icons";

import { MiniCardArt, Vignette } from "./vignette-parts";

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
  // The sample is client-only; disabling chips before it arrives would flip
  // the `disabled` attribute on hydration and mismatch.
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
        className="border-input hover:bg-muted focus-visible:ring-ring flex h-8 w-full items-center gap-2 rounded-lg border px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
