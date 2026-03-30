import type { ActivityAction, CollectionEventResponse, Printing } from "@openrift/shared";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowRightLeft,
  History,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolvePrice } from "@/hooks/use-card-data";
import { useCards } from "@/hooks/use-cards";
import { useCollectionEvents } from "@/hooks/use-collection-events";
import { useCollections } from "@/hooks/use-collections";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import { getCardImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";
import { useCollectionTitle } from "@/routes/_app/_authenticated/collections/route";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/activity")({
  component: ActivityPage,
});

// ── Config ──────────────────────────────────────────────────────────────────

const ACTION_CONFIG = {
  added: { icon: Plus, color: "text-green-600 dark:text-green-400" },
  removed: { icon: Minus, color: "text-red-600 dark:text-red-400" },
  moved: { icon: ArrowLeftRight, color: "text-amber-600 dark:text-amber-400" },
} as const;

type ActionFilter = ActivityAction | "all";
type DatePreset = "all" | "today" | "week" | "month";

// ── Types ───────────────────────────────────────────────────────────────────

interface GroupedEvent {
  event: CollectionEventResponse;
  count: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDateHeading(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("sv");
}

function getDateCutoff(preset: DatePreset): Date | null {
  if (preset === "all") {
    return null;
  }
  const now = new Date();
  if (preset === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (preset === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  // month
  const d = new Date(now);
  d.setDate(d.getDate() - 30);
  return d;
}

function groupEvents(events: CollectionEventResponse[]): GroupedEvent[] {
  const groups = new Map<string, GroupedEvent>();
  for (const event of events) {
    const collectionId = event.toCollectionId ?? event.fromCollectionId ?? "";
    const key = `${event.action}:${event.printingId}:${collectionId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, { event, count: 1 });
    }
  }
  return [...groups.values()];
}

function getTypeIconPath(type: string, superTypes: string[]): string {
  if (type === "Unit" && (superTypes.includes("Champion") || superTypes.includes("Signature"))) {
    return "/images/supertypes/champion.svg";
  }
  return `/images/types/${type.toLowerCase()}.svg`;
}

function lookupPrice(
  printingMap: Map<string, Printing>,
  printingId: string,
  marketplace: string,
): number | undefined {
  const printing = printingMap.get(printingId);
  if (!printing) {
    return undefined;
  }
  return resolvePrice(printing, marketplace as "tcgplayer");
}

// ── Components ──────────────────────────────────────────────────────────────

function Toolbar({
  actionFilter,
  onActionChange,
  collectionFilter,
  onCollectionChange,
  datePreset,
  onDateChange,
}: {
  actionFilter: ActionFilter;
  onActionChange: (v: ActionFilter) => void;
  collectionFilter: string;
  onCollectionChange: (v: string) => void;
  datePreset: DatePreset;
  onDateChange: (v: DatePreset) => void;
}) {
  const { data: collections } = useCollections();

  const actionOptions: { value: ActionFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "added", label: "Added" },
    { value: "removed", label: "Removed" },
    { value: "moved", label: "Moved" },
  ];

  const dateOptions: { value: DatePreset; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "today", label: "Today" },
    { value: "week", label: "7 days" },
    { value: "month", label: "30 days" },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {/* Action filter */}
      <div className="flex gap-0.5">
        {actionOptions.map((opt) => (
          <Button
            key={opt.value}
            variant={actionFilter === opt.value ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onActionChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <div className="bg-border hidden h-5 w-px sm:block" />

      {/* Collection filter */}
      <Select
        value={collectionFilter}
        onValueChange={(v) => onCollectionChange(v ?? "all")}
        items={{
          all: "All collections",
          ...Object.fromEntries(collections?.map((c) => [c.id, c.name]) ?? []),
        }}
      >
        <SelectTrigger size="sm" className="h-7 w-auto text-xs" aria-label="Collection">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All collections</SelectItem>
          {collections?.map((col) => (
            <SelectItem key={col.id} value={col.id}>
              {col.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="bg-border hidden h-5 w-px sm:block" />

      {/* Date filter */}
      <div className="flex gap-0.5">
        {dateOptions.map((opt) => (
          <Button
            key={opt.value}
            variant={datePreset === opt.value ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onDateChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function EventCard({
  event,
  count,
  price,
  formatPrice,
  collectionFilter,
}: GroupedEvent & {
  price: number | undefined;
  formatPrice: (v?: number | null) => string;
  collectionFilter: string;
}) {
  const config = ACTION_CONFIG[event.action];
  const Icon = config.icon;
  const totalPrice = price === undefined ? undefined : price * count;

  // Show collection for moves (from → to), or for adds/removes when no filter is active
  const isMove = event.action === "moved" && event.fromCollectionName && event.toCollectionName;
  const isUnfilteredAddRemove =
    event.action !== "moved" &&
    collectionFilter === "all" &&
    (event.toCollectionName ?? event.fromCollectionName);
  const showCollection = isMove || isUnfilteredAddRemove;

  return (
    <Link
      to="/cards"
      search={{ printingId: event.printingId }}
      className="hover:bg-accent/50 flex items-center gap-3 py-2 transition-colors"
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border",
          "bg-background",
        )}
      >
        <Icon className={cn("size-3.5", config.color)} />
      </div>

      {event.imageUrl ? (
        <img
          src={getCardImageUrl(event.imageUrl, "thumbnail")}
          alt={event.cardName}
          className="h-12 w-[2.15rem] shrink-0 rounded-sm object-cover"
        />
      ) : (
        <div className="bg-muted flex h-12 w-[2.15rem] shrink-0 items-center justify-center rounded-sm">
          <Package className="text-muted-foreground size-3.5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {count > 1 && (
            <Badge variant="secondary" className="text-2xs shrink-0">
              {count}x
            </Badge>
          )}
          <p className="truncate text-sm font-medium">{event.cardName}</p>
        </div>
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          {event.shortCode}
          <img
            src={getTypeIconPath(event.cardType, event.cardSuperTypes)}
            alt={event.cardType}
            title={
              event.cardSuperTypes.length > 0
                ? `${event.cardSuperTypes.join(" ")} ${event.cardType}`
                : event.cardType
            }
            className="size-3.5 brightness-0 dark:invert"
          />
          <img
            src={`/images/rarities/${event.rarity.toLowerCase()}-28x28.webp`}
            alt={event.rarity}
            title={event.rarity}
            className="size-3.5"
          />
          {totalPrice !== undefined && (
            <span className={cn("font-medium", priceColorClass(totalPrice))}>
              {formatPrice(totalPrice)}
            </span>
          )}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-muted-foreground text-xs">{formatTime(event.createdAt)}</p>
        {showCollection && (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {isMove ? (
              <>
                {event.fromCollectionName}
                <ArrowRightLeft className="mx-1 inline size-3" />
                {event.toCollectionName}
              </>
            ) : (
              (event.toCollectionName ?? event.fromCollectionName)
            )}
          </p>
        )}
      </div>
    </Link>
  );
}

function DaySummary({
  events,
  printingMap,
  marketplace,
  formatPrice,
}: {
  events: CollectionEventResponse[];
  printingMap: Map<string, Printing>;
  marketplace: string;
  formatPrice: (v?: number | null) => string;
}) {
  let added = 0;
  let removed = 0;
  let moved = 0;
  let addedValue = 0;
  let removedValue = 0;

  for (const e of events) {
    const price = lookupPrice(printingMap, e.printingId, marketplace);
    if (e.action === "added") {
      added++;
      if (price) {
        addedValue += price;
      }
    } else if (e.action === "removed") {
      removed++;
      if (price) {
        removedValue += price;
      }
    } else {
      moved++;
    }
  }

  const parts: string[] = [];
  if (added > 0) {
    parts.push(`${added} added`);
  }
  if (removed > 0) {
    parts.push(`${removed} removed`);
  }
  if (moved > 0) {
    parts.push(`${moved} moved`);
  }

  const netValue = addedValue - removedValue;

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <span>{parts.join(", ")}</span>
      {netValue !== 0 && (
        <span
          className={cn(
            "font-medium",
            netValue > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
          )}
        >
          {netValue > 0 ? "+" : ""}
          {formatPrice(netValue)}
        </span>
      )}
    </div>
  );
}

function LoadMoreSentinel({
  onIntersect,
  isFetching,
}: {
  onIntersect: () => void;
  isFetching: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onIntersect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect]);

  return (
    <div ref={ref} className="flex justify-center py-4">
      {isFetching && <Loader2 className="text-muted-foreground size-5 animate-spin" />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <History className="text-muted-foreground size-12" />
      <div>
        <p className="font-medium">No activity yet</p>
        <p className="text-muted-foreground mt-1 max-w-xs text-sm">
          Activity is recorded when you add, move, or remove cards. Browse the catalog to start
          building your collection.
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <Button variant="default" size="sm" render={<Link to="/cards" />}>
          <Search className="size-3.5" />
          Browse cards
        </Button>
      </div>
    </div>
  );
}

function FilteredEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <History className="text-muted-foreground size-8" />
      <p className="text-muted-foreground text-sm">No matching activity</p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function ActivityPage() {
  useCollectionTitle("Activity");
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useCollectionEvents();
  const { allPrintings } = useCards();
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "tcgplayer";
  const formatPrice = compactFormatterForMarketplace(marketplace);

  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  const printingMap = new Map(allPrintings.map((p) => [p.id, p]));

  const allEvents = data.pages.flatMap((page) => page.items);

  if (allEvents.length === 0 && !hasNextPage) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <EmptyState />
      </div>
    );
  }

  const dateCutoff = getDateCutoff(datePreset);

  const filtered = allEvents.filter((e) => {
    if (actionFilter !== "all" && e.action !== actionFilter) {
      return false;
    }
    if (collectionFilter !== "all") {
      const matchesCollection =
        e.fromCollectionId === collectionFilter || e.toCollectionId === collectionFilter;
      if (!matchesCollection) {
        return false;
      }
    }
    if (dateCutoff && new Date(e.createdAt) < dateCutoff) {
      return false;
    }
    return true;
  });

  const byDate = Map.groupBy(filtered, (e) => dateKey(e.createdAt));

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Toolbar
        actionFilter={actionFilter}
        onActionChange={setActionFilter}
        collectionFilter={collectionFilter}
        onCollectionChange={setCollectionFilter}
        datePreset={datePreset}
        onDateChange={setDatePreset}
      />

      {filtered.length === 0 ? (
        <FilteredEmptyState />
      ) : (
        <>
          {[...byDate.entries()].map(([date, events]) => {
            const grouped = groupEvents(events);
            return (
              <div key={date} className="mb-6">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {formatDateHeading(events[0].createdAt)}
                  </h2>
                  <DaySummary
                    events={events}
                    printingMap={printingMap}
                    marketplace={marketplace}
                    formatPrice={formatPrice}
                  />
                </div>
                <div className="divide-y">
                  {grouped.map((g) => {
                    const collectionId = g.event.toCollectionId ?? g.event.fromCollectionId ?? "";
                    return (
                      <EventCard
                        key={`${g.event.action}:${g.event.printingId}:${collectionId}`}
                        {...g}
                        price={lookupPrice(printingMap, g.event.printingId, marketplace)}
                        formatPrice={formatPrice}
                        collectionFilter={collectionFilter}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {hasNextPage && (
            <LoadMoreSentinel onIntersect={fetchNextPage} isFetching={isFetchingNextPage} />
          )}
        </>
      )}
    </div>
  );
}
