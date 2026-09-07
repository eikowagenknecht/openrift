import type { ActivityAction, CollectionEventResponse } from "@openrift/shared";
import { formatDayLocal, formatTimeLocal, legendDisplayName } from "@openrift/shared";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import {
  ArrowLeftRightIcon,
  ArrowRightLeftIcon,
  HistoryIcon,
  Loader2Icon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { use, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { EmptyState } from "@/components/empty-state";
import { PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCollectionEvents } from "@/hooks/use-collection-events";
import { useCollections } from "@/hooks/use-collections";
import { useEnumOrders } from "@/hooks/use-enums";
import { usePrices } from "@/hooks/use-prices";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import { getFilterIconPath, getTypeIconPaths } from "@/lib/icons";
import { cn, PAGE_WIDTH } from "@/lib/utils";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/activity")({
  component: ActivityPage,
});

const ACTION_CONFIG = {
  added: { icon: PlusIcon, color: "text-success" },
  removed: { icon: MinusIcon, color: "text-destructive" },
  moved: { icon: ArrowLeftRightIcon, color: "text-warning" },
} as const;

type ActionFilter = ActivityAction | "all";
type DatePreset = "all" | "today" | "week" | "month";

interface GroupedEvent {
  event: CollectionEventResponse;
  count: number;
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

  // Single source for the collection picker: drives both the value-label
  // resolution (items) and the rendered options, so they can't drift.
  const collectionItems: Record<string, string> = {
    all: "All collections",
    ...Object.fromEntries(
      (collections ?? []).map((collection) => [collection.id, collection.name]),
    ),
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Select
        value={collectionFilter}
        onValueChange={(v) => onCollectionChange(v ?? "all")}
        items={collectionItems}
      >
        <SelectTrigger className="w-auto" aria-label="Collection">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(collectionItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[actionFilter]}
        onValueChange={([next]) => {
          const option = actionOptions.find((entry) => entry.value === next);
          if (option) {
            onActionChange(option.value);
          }
        }}
        aria-label="Action"
      >
        {actionOptions.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[datePreset]}
        onValueChange={([next]) => {
          const option = dateOptions.find((entry) => entry.value === next);
          if (option) {
            onDateChange(option.value);
          }
        }}
        aria-label="Time range"
        className="ml-auto"
      >
        {dateOptions.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
  const displayName = legendDisplayName({
    name: event.cardName,
    types: event.cardTypes,
    tags: event.tags,
  });
  const totalPrice = price === undefined ? undefined : price * count;
  const { labels } = useEnumOrders();
  const cardTypeLabel = event.cardTypes.map((slug) => labels.cardTypes[slug]).join(" ");
  const superTypeLabels = event.cardSuperTypes.map((slug) => labels.superTypes[slug]);
  const rarityLabel = labels.rarities[event.rarity];

  const isMove = event.action === "moved" && event.fromCollectionName && event.toCollectionName;
  const isUnfilteredAddRemove =
    event.action !== "moved" &&
    collectionFilter === "all" &&
    (event.toCollectionName ?? event.fromCollectionName);
  const showCollection = isMove || isUnfilteredAddRemove;
  const typeIconPaths = getTypeIconPaths(event.cardTypes, event.cardSuperTypes);
  const rarityIconPath = getFilterIconPath("rarities", event.rarity);

  return (
    <Link
      to="/cards"
      search={{ printingId: event.printingId }}
      className="hover:bg-muted/50 flex items-center gap-3 py-2 transition-colors"
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border",
          "bg-background",
        )}
      >
        <Icon className={cn("size-3.5", config.color)} />
      </div>

      <CardArtThumb
        shape="strip"
        imageId={event.imageId}
        alt={displayName}
        className="h-9"
        loading="lazy"
        fallback={
          <span className="bg-muted absolute inset-0 flex items-center justify-center">
            <PackageIcon className="text-muted-foreground size-3.5" />
          </span>
        }
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {count > 1 && (
            <Badge variant="secondary" className="text-2xs shrink-0">
              {count}x
            </Badge>
          )}
          <p className="truncate text-sm font-medium">{displayName}</p>
        </div>
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          {event.shortCode}
          {typeIconPaths.map((path) => (
            <img
              key={path}
              src={path}
              alt={cardTypeLabel}
              title={
                superTypeLabels.length > 0
                  ? `${superTypeLabels.join(" ")} ${cardTypeLabel}`
                  : cardTypeLabel
              }
              className="size-3.5 brightness-0 dark:invert"
            />
          ))}
          {rarityIconPath && (
            <img src={rarityIconPath} alt={rarityLabel} title={rarityLabel} className="size-3.5" />
          )}
          {totalPrice !== undefined && (
            <span className={cn("font-medium", priceColorClass(totalPrice))}>
              {formatPrice(totalPrice)}
            </span>
          )}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-muted-foreground text-xs">{formatTimeLocal(event.createdAt)}</p>
        {showCollection && (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {isMove ? (
              <>
                {event.fromCollectionName}
                <ArrowRightLeftIcon className="mx-1 inline size-3" />
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
  marketplace,
  formatPrice,
}: {
  events: CollectionEventResponse[];
  marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
  formatPrice: (v?: number | null) => string;
}) {
  const prices = usePrices();
  let added = 0;
  let removed = 0;
  let moved = 0;
  let addedValue = 0;
  let removedValue = 0;

  for (const e of events) {
    const price = prices.get(e.printingId, marketplace);
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

  const netValue = Math.round((addedValue - removedValue) * 100) / 100;

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <span>{parts.join(", ")}</span>
      {netValue !== 0 && (
        <span className={cn("font-medium", netValue > 0 ? "text-success" : "text-destructive")}>
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
    if (!el || isFetching) {
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
  }, [onIntersect, isFetching]);

  return (
    <div ref={ref} className="flex justify-center py-4">
      {isFetching && <Loader2Icon className="text-muted-foreground size-5 animate-spin" />}
    </div>
  );
}

function ActivityEmptyState() {
  return (
    <EmptyState
      className="py-20"
      icon={HistoryIcon}
      title="No activity yet"
      description="Browse the catalog to start building your collection."
    >
      <Button variant="default" render={<Link to="/cards" />}>
        <SearchIcon />
        Browse cards
      </Button>
    </EmptyState>
  );
}

function FilteredEmptyState() {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia>
          <HistoryIcon className="text-muted-foreground size-8" />
        </EmptyMedia>
        <EmptyDescription>No matching activity</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ActivityPage() {
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useCollectionEvents();
  const prices = usePrices();
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  const formatPrice = compactFormatterForMarketplace(marketplace);

  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  const allEvents = data.pages.flatMap((page) => page.items);

  const topBarPortal =
    topBarSlot &&
    createPortal(
      <PageTopBar>
        <PageTopBarTitle onToggleSidebar={toggleSidebar}>Activity</PageTopBarTitle>
      </PageTopBar>,
      topBarSlot,
    );

  if (allEvents.length === 0 && !hasNextPage) {
    return (
      <div className={cn(PAGE_WIDTH.capped, "pt-3")}>
        {topBarPortal}
        <ActivityEmptyState />
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

  const byDate = Map.groupBy(filtered, (e) => formatDayLocal(e.createdAt));

  return (
    <div className={cn(PAGE_WIDTH.capped, "pt-3")}>
      {topBarPortal}
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
                  <SectionHeading>{formatDayLocal(events[0].createdAt)}</SectionHeading>
                  <DaySummary events={events} marketplace={marketplace} formatPrice={formatPrice} />
                </div>
                <div className="divide-y">
                  {grouped.map((g) => {
                    const collectionId = g.event.toCollectionId ?? g.event.fromCollectionId ?? "";
                    return (
                      <EventCard
                        key={`${g.event.action}:${g.event.printingId}:${collectionId}`}
                        {...g}
                        price={prices.get(g.event.printingId, marketplace)}
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
            <LoadMoreSentinel
              onIntersect={() => void fetchNextPage()}
              isFetching={isFetchingNextPage}
            />
          )}
        </>
      )}
    </div>
  );
}
