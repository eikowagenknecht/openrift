import type { FriendGroupActivityEvent, ListIntent } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRightIcon,
  FolderIcon,
  HandshakeIcon,
  HeartIcon,
  SparklesIcon,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { UserAvatar } from "@/components/user-avatar";
import { useCards } from "@/hooks/use-cards";
import { useFriendGroupActivity } from "@/hooks/use-friend-groups";
import { formatRelativeTime } from "@/lib/format-relative-time";

import { SECTION_HEADING } from "./friend-group-shell";

const LIST_INTENT_ICON: Record<ListIntent, ComponentType<SVGProps<SVGSVGElement>>> = {
  wish: HeartIcon,
  trade: HandshakeIcon,
  organize: FolderIcon,
};
const LIST_INTENT_NOUN: Record<ListIntent, string> = {
  wish: "wishlist",
  trade: "tradelist",
  organize: "list",
};

const FEED_VISIBLE = 20;
const ROW_CLASS = "hover:bg-muted/50 flex items-center gap-3 rounded-md px-2 py-2";

/**
 * The group's recent activity: completed trades, new matches for the viewer,
 * shared lists/collections, and members joining — newest first. Derived
 * server-side from existing rows (no event log); see the activity endpoint.
 * @returns The activity-feed section.
 */
export function FriendGroupActivityFeed({ slug }: { slug: string }) {
  const { data } = useFriendGroupActivity(slug);
  const events = data.events.slice(0, FEED_VISIBLE);

  return (
    <section className="flex flex-col gap-4">
      <h2 className={SECTION_HEADING}>Recent activity</h2>
      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing yet. Trades, shared lists, and new members will show up here.
        </p>
      ) : (
        <ul className="flex max-w-3xl flex-col">
          {events.map((event) => (
            <li key={activityKey(event)}>
              <ActivityRow slug={slug} event={event} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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

function ActivityRow({ slug, event }: { slug: string; event: FriendGroupActivityEvent }) {
  const { cardsById, printingsById } = useCards();

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
    <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{body}</span>
  );

  // Each branch renders its own concrete <Link> so `to`/`params` stay correlated
  // (TanStack types them together — a shared dynamic `to` would not typecheck).
  switch (event.kind) {
    case "trade-completed": {
      return (
        <Link to="/groups/$slug/trades" params={{ slug }} className={ROW_CLASS}>
          <FeedIcon icon={ArrowLeftRightIcon} />
          {thumb(event.printingId, cardName(event.cardId))}
          {text(
            <>
              <strong className="font-medium">{event.giverName ?? "A member"}</strong> traded{" "}
              {event.quantity}× {cardName(event.cardId)} to{" "}
              <strong className="font-medium">{event.receiverName ?? "a member"}</strong>
            </>,
          )}
          {time}
        </Link>
      );
    }
    case "match": {
      return (
        <Link to="/groups/$slug/trades" params={{ slug }} className={ROW_CLASS}>
          <FeedIcon icon={SparklesIcon} tone="primary" />
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
          <FeedIcon icon={Icon} />
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
          <FeedIcon icon={FolderIcon} />
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

function FeedIcon({
  icon: Icon,
  tone = "muted",
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: "muted" | "primary";
}) {
  return (
    <span
      className={
        tone === "primary"
          ? "bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full"
          : "bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
      }
    >
      <Icon className="size-4" />
    </span>
  );
}
