import { formatTimeLocal } from "@openrift/shared/format-date";
import type {
  FriendGroupDetailResponse,
  FriendGroupShopEventResponse,
} from "@openrift/shared/types/api/friend-group";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, StoreIcon } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { CardList } from "@/components/ui/card-list";
import { IconChip } from "@/components/ui/icon-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isAdmin } from "@/features/groups/components/friend-group-shell";
import { HOVER_ROW_CLASS } from "@/features/groups/components/hover-row";
import { useFriendGroupShopEvents } from "@/features/groups/hooks/use-friend-group-shops";
import { filterShopEvents, groupShopEventsByDay } from "@/features/groups/lib/shop-events";

const ALL_SHOPS = "all";

export function ShopEventsContent({
  slug,
  data,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
}) {
  const { data: feed } = useFriendGroupShopEvents(slug);
  const [shopFilter, setShopFilter] = useState<string>(ALL_SHOPS);

  if (feed.shops.length === 0) {
    return (
      <EmptyState
        icon={StoreIcon}
        title="No shop linked yet"
        description={
          isAdmin(data.viewerRole)
            ? "Link the store your group plays at and its next events land here."
            : "When an admin links the store your group plays at, its next events land here."
        }
      >
        {isAdmin(data.viewerRole) ? (
          <Button render={<Link to="/groups/$slug/manage" params={{ slug }} hash="shops" />}>
            Link a shop
          </Button>
        ) : null}
      </EmptyState>
    );
  }

  const selectedStoreId = shopFilter === ALL_SHOPS ? null : Number(shopFilter);
  const events = filterShopEvents(feed.items, selectedStoreId);
  const days = groupShopEventsByDay(events);

  return (
    <div className="flex flex-col gap-6">
      <PageDescription>
        Upcoming Riftbound events at the shops this group follows. Listings come from the official
        event locator; each one links back to its page there.
      </PageDescription>

      <div className="flex flex-wrap items-center gap-3">
        {feed.shops.length > 1 ? (
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[shopFilter]}
            onValueChange={([next]) => setShopFilter(next ?? ALL_SHOPS)}
            aria-label="Shop"
          >
            <ToggleGroupItem value={ALL_SHOPS}>All shops</ToggleGroupItem>
            {feed.shops.map((shop) => (
              <ToggleGroupItem key={shop.storeId} value={String(shop.storeId)}>
                {shop.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        <span className="text-muted-foreground ml-auto text-xs">
          Next {feed.horizonDays} days · {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>

      {days.length === 0 ? (
        <p className="text-muted-foreground">Nothing listed in the next {feed.horizonDays} days.</p>
      ) : (
        days.map((day) => (
          <section key={day.day} className="flex flex-col gap-2.5">
            <SectionHeading size="sm">{day.label}</SectionHeading>
            <CardList>
              {day.events.map((event) => (
                <li key={event.externalId}>
                  <ShopEventRow event={event} showShop={selectedStoreId === null} />
                </li>
              ))}
            </CardList>
          </section>
        ))
      )}
    </div>
  );
}

function ShopEventRow({
  event,
  showShop,
}: {
  event: FriendGroupShopEventResponse;
  showShop: boolean;
}) {
  const meta = [
    formatTimeLocal(event.startAt),
    ...(showShop ? [event.storeName] : []),
    ...(event.eventFormat === null ? [] : [event.eventFormat]),
  ].join(" · ");

  return (
    <a href={event.url} target="_blank" rel="noreferrer" className={HOVER_ROW_CLASS}>
      <IconChip icon={StoreIcon} tone="info" size="sm" shape="round" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{event.name}</span>
        <span className="text-muted-foreground truncate text-xs">{meta}</span>
      </span>
      <ExternalLinkIcon className="text-muted-foreground/40 size-4 shrink-0" />
    </a>
  );
}
