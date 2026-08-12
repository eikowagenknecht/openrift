import type { FriendGroupMemberResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, Share2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { IconChip } from "@/components/ui/icon-chip";
import { UserAvatar } from "@/components/user-avatar";
import { useFriendGroupShareableLists } from "@/hooks/use-friend-groups";
import type { TradeHubCard } from "@/lib/trade-hub";
import {
  expiringSoonCount,
  isQuietTradeHubCard,
  needsYouCounts,
  suggestionsLine,
} from "@/lib/trade-hub";
import { cn } from "@/lib/utils";

import { ShareListsWithGroupDialog } from "./share-lists-with-group-dialog";

/**
 * The card's gold line: what the two of you are waiting on *you* for, split by
 * the act it takes — a request wants a decision, a settle wants the cards in
 * someone's hand. The expiry tail is appended only when a request will run out
 * on its own, which is the one thing on the card with a deadline.
 * @param card The person's card.
 * @returns The line, or null when nothing waits on the viewer.
 */
function actionLine(card: TradeHubCard<FriendGroupMemberResponse>): string | null {
  if (card.needsYou.length === 0) {
    return null;
  }
  const { toAnswer, toHandOver, toReceive } = needsYouCounts(card.needsYou);
  const acts: string[] = [];
  if (toAnswer > 0) {
    acts.push(`${toAnswer} to answer`);
  }
  if (toHandOver > 0) {
    acts.push(`${toHandOver} to hand over`);
  }
  if (toReceive > 0) {
    acts.push(`${toReceive} to receive`);
  }

  const parts = [`Your move · ${acts.join(", ")}`];
  const soon = expiringSoonCount(card.needsYou);
  if (soon > 0) {
    parts.push(`${soon} ${soon === 1 ? "expires" : "expire"} soon`);
  }
  return parts.join(" · ");
}

/**
 * The card's muted line: everything true about this person that isn't asking
 * anything of you. Plain text rather than badges — colored chips read as things
 * to act on, and the whole point of the line is that none of these are.
 * Suggestions are deliberately not in here: they are the one fact that is an
 * opportunity, so they get their own green line on the card.
 * @param card The person's card.
 * @returns The line, or null when there's nothing to say.
 */
function factsLine(card: TradeHubCard<FriendGroupMemberResponse>): string | null {
  const parts: string[] = [];
  if (card.open.length > 0) {
    parts.push(`${card.open.length} waiting on them`);
  }
  if (card.listCount > 0) {
    parts.push(`shares ${card.listCount} ${card.listCount === 1 ? "list" : "lists"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** @returns The card's muted footer line, or null when there's nothing behind it. */
function footerLine(card: TradeHubCard<FriendGroupMemberResponse>): string | null {
  const parts: string[] = [];
  if (card.tradedCount > 0) {
    parts.push(`${card.tradedCount} ${card.tradedCount === 1 ? "trade" : "trades"} done`);
  }
  if (card.elsewhereCount > 0) {
    parts.push(`+${card.elsewhereCount} in other groups`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * One member's card on the hub: who they are, and in three lines what standing
 * between the two of you. The whole card is the link to their trade sheet,
 * where every one of those things is acted on — so the card only has to be
 * legible, never operated, and nothing inside it competes for the click.
 *
 * Only what waits on the viewer is gold; the rest is muted text, because a card
 * where four counts all shout has no way left to say "this one".
 *
 * A member with nothing going on still gets a card, dimmed: they are who you'd
 * start the next trade with, and a hub that hides them is a hub that only ever
 * shows the people you already trade with.
 * @returns The member card.
 */
export function TradeHubMemberCard({
  card,
  slug,
}: {
  card: TradeHubCard<FriendGroupMemberResponse>;
  /** The group this hub belongs to, so the sheet's trail leads back to it. */
  slug: string;
}) {
  const { member } = card;
  const quiet = isQuietTradeHubCard(card);
  const action = actionLine(card);
  const suggestions = suggestionsLine(card);
  const facts = factsLine(card);
  const footer = footerLine(card);

  return (
    <CardLink
      render={
        <Link to="/trades/$userId" params={{ userId: member.userId }} search={{ from: slug }} />
      }
      className={cn("gap-1.5 p-4", quiet && "opacity-60")}
    >
      <div className="flex items-center gap-2.5">
        <UserAvatar
          image={member.userImage}
          name={member.userName}
          gravatarHash={member.gravatarHash}
          size="sm"
        />
        <span className="min-w-0 flex-1 truncate font-medium">{member.userName ?? "Member"}</span>
        <ChevronRightIcon className="text-muted-foreground/40 group-hover/card:text-muted-foreground size-4 shrink-0 transition-transform group-hover/card:translate-x-0.5" />
      </div>

      {/* "in this group", because the card only counts what this group's shared
          lists produced. The same two people may well have trades and
          suggestions through another shared group, and the sheet this card
          opens shows those too — a bare "Nothing traded yet" then reads as a
          contradiction. */}
      {quiet ? <p className="text-muted-foreground">Nothing in this group yet</p> : null}
      {action === null ? null : (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{action}</p>
      )}
      {/* The one fact that is an opportunity rather than a record, so it sits
          apart from the muted line — green like the incoming arrow, one step
          below the gold of what already waits. */}
      {suggestions === null ? null : (
        <p className="flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-500">
          <SparklesIcon className="size-3.5 shrink-0" />
          {suggestions}
        </p>
      )}
      {facts === null ? null : <p className="text-muted-foreground text-sm">{facts}</p>}
      {footer === null ? null : <p className="text-muted-foreground text-xs">{footer}</p>}
    </CardLink>
  );
}

/**
 * The slim band closing the hub: how much of the viewer's own shelf this group
 * can see, and a one-press way to widen it. Sharing is the only thing that makes
 * the cards above fill up, so it sits on the page rather than on Manage.
 *
 * Reads the shareable-lists query, so it must be wrapped in a Suspense boundary.
 * @returns The band.
 */
export function ShareYourListsBand({ slug, groupName }: { slug: string; groupName: string }) {
  const { data } = useFriendGroupShareableLists(slug);
  const [open, setOpen] = useState(false);

  const tradable = data.items.filter(
    (item) => item.listIntent === "wish" || item.listIntent === "trade",
  );
  const shared = tradable.filter((item) => item.sharedAt !== null);

  if (tradable.length === 0) {
    return (
      <Card className="flex-row items-center gap-3 p-3">
        <IconChip icon={Share2Icon} tone="sky" size="sm" shape="round" />
        <p className="text-muted-foreground min-w-0 flex-1">
          You don&apos;t have a wishlist or tradelist yet.{" "}
          <Link to="/collections" className="text-foreground underline underline-offset-4">
            Create one
          </Link>{" "}
          and share it with {groupName} to start finding trades.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex-row items-center gap-3 p-3">
      <IconChip icon={Share2Icon} tone="sky" size="sm" shape="round" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-medium">
          You&apos;ve shared {shared.length} of {tradable.length}{" "}
          {tradable.length === 1 ? "list" : "lists"} with this group
        </p>
        <p className="text-muted-foreground text-xs">
          Members can only find trades with you through the lists you share.
        </p>
      </div>
      {shared.length === tradable.length ? null : (
        <>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setOpen(true)}>
            <Share2Icon />
            Share more
          </Button>
          <ShareListsWithGroupDialog
            slug={slug}
            groupName={groupName}
            open={open}
            onOpenChange={setOpen}
            cancelLabel="Cancel"
            preselectAll={false}
          />
        </>
      )}
    </Card>
  );
}
