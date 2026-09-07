import { formatRelativeTime } from "@openrift/shared/format-date";
import type { MetaActivityItem } from "@openrift/shared/types/api/meta";
import { Link } from "@tanstack/react-router";
import { CalendarPlusIcon, ChevronRightIcon, ListOrderedIcon, ListPlusIcon } from "lucide-react";
import type { ComponentType } from "react";

import { Card } from "@/components/ui/card";

const KIND_ICON: Record<MetaActivityItem["kind"], ComponentType<{ className?: string }>> = {
  "event-added": CalendarPlusIcon,
  "decks-added": ListPlusIcon,
  "results-added": ListOrderedIcon,
};

function itemHeadline(item: MetaActivityItem): string {
  switch (item.kind) {
    case "event-added": {
      return "New event on record";
    }
    case "decks-added": {
      return item.count === 1 ? "1 decklist added" : `${item.count} decklists added`;
    }
    case "results-added": {
      return item.count === 1 ? "1 result added" : `${item.count} results added`;
    }
  }
}

function ActivityRow({ item }: { item: MetaActivityItem }) {
  const Icon = KIND_ICON[item.kind];

  return (
    <Link
      to="/meta/$slug"
      params={{ slug: item.event.slug }}
      className="hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-3 px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:-outline-offset-2"
    >
      <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
        <Icon aria-hidden className="size-3.5" />
      </span>
      {/* The event takes its own line: sharing one with the headline truncated it away in a 20rem rail. */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{itemHeadline(item)}</span>
        <span className="truncate">{item.event.name}</span>
        <span className="text-muted-foreground text-xs">{formatRelativeTime(item.occurredAt)}</span>
      </span>
      <ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
}

export function MetaArchiveActivity({ items }: { items: readonly MetaActivityItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Card className="gap-0 p-0">
      <ul className="divide-border divide-y">
        {items.map((item) => (
          <li key={`${item.kind}-${item.event.slug}-${item.occurredAt}`}>
            <ActivityRow item={item} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
