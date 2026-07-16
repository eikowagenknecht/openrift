import type { FriendGroupActivityEvent } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRightIcon, FolderIcon, SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardArtThumbStack } from "@/components/cards/card-art-thumb-stack";
import { IconChip } from "@/components/ui/icon-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { useCards } from "@/hooks/use-cards";
import { useFriendGroupActivity } from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { AggregatedActivityRow, TradeBatch } from "@/lib/friend-group-activity";
import { aggregateActivityEvents } from "@/lib/friend-group-activity";

import { LIST_INTENT_ICON, LIST_INTENT_NOUN } from "./list-intent-meta";

const FEED_VISIBLE = 20;
const ROW_CLASS = "hover:bg-muted/50 flex items-center gap-3 rounded-md px-2 py-2.5";

const DAY_MS = 86_400_000;
type ActivityBucket = "today" | "yesterday" | "week" | "earlier";
const BUCKET_ORDER: readonly ActivityBucket[] = ["today", "yesterday", "week", "earlier"];
const BUCKET_LABEL: Record<ActivityBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Earlier this week",
  earlier: "Earlier",
};

/**
 * Sorts an activity timestamp into a relative day bucket, matching how
 * {@link formatRelativeTime} reads "now" so the heading and the per-row label
 * never disagree.
 * @returns The bucket the event belongs to.
 */
function activityBucket(at: string, now: Date): ActivityBucket {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = new Date(at).getTime();
  if (ts >= startOfToday) {
    return "today";
  }
  if (ts >= startOfToday - DAY_MS) {
    return "yesterday";
  }
  if (ts >= startOfToday - 6 * DAY_MS) {
    return "week";
  }
  return "earlier";
}

/**
 * The group's recent activity: completed trades, new matches for the viewer,
 * shared lists/collections, and members joining — newest first, split into
 * relative day groups as a clean stacked list. Derived server-side
 * from existing rows (no event log); see the activity endpoint.
 * @returns The activity-feed section.
 */
export function FriendGroupActivityFeed({ slug }: { slug: string }) {
  const { data } = useFriendGroupActivity(slug);
  const rows = aggregateActivityEvents(data.events.slice(0, FEED_VISIBLE));
  const now = new Date();
  const grouped = Map.groupBy(rows, (row) => activityBucket(row.at, now));

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>Recent activity</SectionHeading>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing yet. Trades, shared lists, and new members will show up here.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {BUCKET_ORDER.map((bucket) => {
            const group = grouped.get(bucket);
            if (!group || group.length === 0) {
              return null;
            }
            return (
              <div key={bucket} className="flex flex-col gap-1">
                <SectionHeading as="h3" size="sm" className="px-2">
                  {BUCKET_LABEL[bucket]}
                </SectionHeading>
                <ul className="flex flex-col">
                  {group.map((row) => (
                    <li key={rowKey(row)}>
                      {row.kind === "trade-batch" ? (
                        <TradeBatchRow slug={slug} batch={row} />
                      ) : (
                        <ActivityRow slug={slug} event={row.event} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function rowKey(row: AggregatedActivityRow): string {
  return row.kind === "trade-batch" ? `batch:${row.events[0].tradeId}` : activityKey(row.event);
}

function activityKey(event: FriendGroupActivityEvent): string {
  switch (event.kind) {
    case "trade-completed": {
      return `trade:${event.tradeId}`;
    }
    case "member-joined": {
      return `member:${event.userId}`;
    }
    case "list-shared": {
      return `list:${event.listId}`;
    }
    case "collection-shared": {
      return `collection:${event.collectionId}`;
    }
    case "match": {
      return `match:${event.counterpartyUserId}:${event.printingId}`;
    }
  }
}

/**
 * A collapsed run of completed trades between the same two members: one line
 * of text ("Thogrim traded 20 cards to you") over an overlapping stack of the
 * traded cards' art. Links to the Trades page like the single-trade row.
 * @returns The batch row.
 */
function TradeBatchRow({ slug, batch }: { slug: string; batch: TradeBatch }) {
  const { printingsById } = useCards();
  const viewerId = useRequiredUserId();
  // One thumb per distinct printing — a batch can trade several copies of the
  // same card, and repeating its art adds nothing.
  const seen = new Set<string>();
  const thumbs = batch.events
    .filter((event) => {
      if (seen.has(event.printingId)) {
        return false;
      }
      seen.add(event.printingId);
      return true;
    })
    .map((event) => ({
      key: event.tradeId,
      imageId:
        printingsById[event.printingId]?.images.find((image) => image.face === "front")?.imageId ??
        null,
    }));
  return (
    <Link to="/groups/$slug/trades" params={{ slug }} className={ROW_CLASS}>
      <IconChip icon={ArrowLeftRightIcon} tone="primary" size="sm" shape="round" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-muted-foreground min-w-0 text-sm">
          <strong className="font-medium">
            {batch.giverUserId === viewerId ? "You" : (batch.giverName ?? "A member")}
          </strong>{" "}
          traded {batch.totalQuantity} cards to{" "}
          <strong className="font-medium">
            {batch.receiverUserId === viewerId ? "you" : (batch.receiverName ?? "a member")}
          </strong>
        </span>
        <CardArtThumbStack items={thumbs} />
      </span>
      <time className="text-muted-foreground text-2xs shrink-0 self-start pt-0.5">
        {formatRelativeTime(batch.at)}
      </time>
    </Link>
  );
}

function ActivityRow({ slug, event }: { slug: string; event: FriendGroupActivityEvent }) {
  const { cardsById, printingsById } = useCards();
  const viewerId = useRequiredUserId();

  const cardName = (cardId: string): string => cardsById[cardId]?.name ?? "a card";
  const thumb = (printingId: string, alt: string): ReactNode => {
    const imageId = printingsById[printingId]?.images.find(
      (image) => image.face === "front",
    )?.imageId;
    return <CardArtThumb imageId={imageId} alt={alt} className="w-7" loading="lazy" />;
  };
  const time = (
    <time className="text-muted-foreground text-2xs shrink-0">{formatRelativeTime(event.at)}</time>
  );
  const text = (body: ReactNode): ReactNode => (
    <span className="text-muted-foreground line-clamp-2 min-w-0 flex-1 text-sm">{body}</span>
  );

  // Each branch renders its own concrete <Link> so `to`/`params` stay correlated
  // (TanStack types them together — a shared dynamic `to` would not typecheck).
  switch (event.kind) {
    case "trade-completed": {
      return (
        <Link to="/groups/$slug/trades" params={{ slug }} className={ROW_CLASS}>
          <IconChip icon={ArrowLeftRightIcon} tone="primary" size="sm" shape="round" />
          {thumb(event.printingId, cardName(event.cardId))}
          {text(
            <>
              <strong className="font-medium">
                {event.giverUserId === viewerId ? "You" : (event.giverName ?? "A member")}
              </strong>{" "}
              traded {event.quantity}× {cardName(event.cardId)} to{" "}
              <strong className="font-medium">
                {event.receiverUserId === viewerId ? "you" : (event.receiverName ?? "a member")}
              </strong>
            </>,
          )}
          {time}
        </Link>
      );
    }
    case "match": {
      return (
        <Link to="/groups/$slug/trades" params={{ slug }} className={ROW_CLASS}>
          <IconChip icon={SparklesIcon} tone="primary" size="sm" shape="round" />
          {thumb(event.printingId, cardName(event.cardId))}
          {text(
            <>
              <strong className="font-medium">{event.counterpartyName ?? "A member"}</strong> has{" "}
              {cardName(event.cardId)} you want
            </>,
          )}
          {time}
        </Link>
      );
    }
    case "member-joined": {
      return (
        <Link
          to="/groups/$slug/members/$userId"
          params={{ slug, userId: event.userId }}
          className={ROW_CLASS}
        >
          <UserAvatar
            image={event.userImage}
            name={event.userName}
            gravatarHash={event.gravatarHash}
          />
          {text(
            <>
              <strong className="font-medium">{event.userName ?? "A member"}</strong> joined the
              group
            </>,
          )}
          {time}
        </Link>
      );
    }
    case "list-shared": {
      const Icon = LIST_INTENT_ICON[event.listIntent];
      return (
        <Link
          to="/groups/$slug/lists/$listId"
          params={{ slug, listId: event.listId }}
          className={ROW_CLASS}
        >
          <IconChip icon={Icon} size="sm" shape="round" />
          {text(
            <>
              <strong className="font-medium">{event.userName ?? "A member"}</strong> shared the{" "}
              {LIST_INTENT_NOUN[event.listIntent]} {event.listName}
            </>,
          )}
          {time}
        </Link>
      );
    }
    case "collection-shared": {
      return (
        <Link
          to="/groups/$slug/collections/$collectionId"
          params={{ slug, collectionId: event.collectionId }}
          className={ROW_CLASS}
        >
          <IconChip icon={FolderIcon} size="sm" shape="round" />
          {text(
            <>
              <strong className="font-medium">{event.userName ?? "A member"}</strong> shared the
              collection {event.collectionName}
            </>,
          )}
          {time}
        </Link>
      );
    }
  }
}
