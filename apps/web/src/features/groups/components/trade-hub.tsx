import type { FriendGroupMemberResponse } from "@openrift/shared/types/api/friend-group";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, Share2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { IconChip } from "@/components/ui/icon-chip";
import { UserAvatar } from "@/components/user-avatar";
import { CardArtThumbStack } from "@/features/cards/components/card-art-thumb-stack";
import { useCards } from "@/features/cards/hooks/use-cards";
import { frontImageId } from "@/features/cards/lib/card-meta";
import { useFriendGroupShareableLists } from "@/features/groups/hooks/use-friend-group-sharing";
import { distinctPrintingIds } from "@/features/groups/lib/friend-group-activity";
import type { TradeHubCard } from "@/features/groups/lib/trade-hub";
import {
  expiringSoonCount,
  isQuietTradeHubCard,
  needsYouCounts,
  suggestionsLine,
} from "@/features/groups/lib/trade-hub";
import { cn } from "@/lib/utils";

import { ShareListsWithGroupDialog } from "./share-lists-with-group-dialog";

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
    // Matches the overview band's "To confirm" label for the same stage.
    acts.push(`${toReceive} to confirm`);
  }

  const parts = [acts.join(", ")];
  const soon = expiringSoonCount(card.needsYou);
  if (soon > 0) {
    parts.push(`${soon} ${soon === 1 ? "expires" : "expire"} soon`);
  }
  return parts.join(" · ");
}

function factsLine(card: TradeHubCard<FriendGroupMemberResponse>): string | null {
  return card.open.length > 0 ? `${card.open.length} waiting on them` : null;
}

function footerLine(card: TradeHubCard<FriendGroupMemberResponse>): string | null {
  const parts: string[] = [];
  if (card.tradedCount > 0) {
    parts.push(`${card.tradedCount} ${card.tradedCount === 1 ? "trade" : "trades"} done`);
  }
  if (card.elsewhereCount > 0) {
    parts.push(`+${card.elsewhereCount} in other groups`);
  }
  if (card.listCount > 0) {
    parts.push(`shares ${card.listCount} ${card.listCount === 1 ? "list" : "lists"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function TradeHubMemberCard({
  card,
  slug,
}: {
  card: TradeHubCard<FriendGroupMemberResponse>;
  slug: string;
}) {
  const { member } = card;
  const { printingsById } = useCards();
  const quiet = isQuietTradeHubCard(card);
  const action = actionLine(card);
  const suggestions = suggestionsLine(card);
  const facts = factsLine(card);
  const footer = footerLine(card);
  const waitingArt = distinctPrintingIds(card.needsYou).map((printingId) => ({
    key: printingId,
    imageId: frontImageId(printingsById[printingId]),
  }));

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

      {quiet ? <p className="text-muted-foreground">Nothing in this group yet</p> : null}
      {action === null ? null : <p className="text-warning text-sm font-medium">{action}</p>}
      {waitingArt.length > 0 ? (
        <CardArtThumbStack items={waitingArt} max={5} thumbClassName="w-8" />
      ) : null}
      {suggestions === null ? null : (
        <p className="text-success flex items-center gap-1 text-sm font-medium">
          <SparklesIcon className="size-3.5 shrink-0" />
          {suggestions}
        </p>
      )}
      {facts === null ? null : <p className="text-muted-foreground text-sm">{facts}</p>}
      {footer === null ? null : <p className="text-muted-foreground text-xs">{footer}</p>}
    </CardLink>
  );
}

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
        <IconChip icon={Share2Icon} tone="info" size="sm" shape="round" />
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
      <IconChip icon={Share2Icon} tone="info" size="sm" shape="round" />
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
