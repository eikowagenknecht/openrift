import type {
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupShareResponse,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  HandshakeIcon,
  HeartIcon,
  Share2Icon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, useState } from "react";

import { CardDetailOverlayProvider } from "@/components/cards/card-detail-opener";
import { EmptyState } from "@/components/empty-state";
import { ActionBand } from "@/components/ui/action-band";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IconChip } from "@/components/ui/icon-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { useGroupTrades, useUserTrades } from "@/hooks/use-card-trades";
import {
  useFriendGroupMatches,
  useFriendGroupShareableLists,
  useShareListWithFriendGroup,
} from "@/hooks/use-friend-groups";
import { usePrices } from "@/hooks/use-prices";
import { useRequiredUserId } from "@/lib/auth-session";
import {
  countTradeSuggestions,
  sumTradeValues,
  tradeSection,
  tradesHubSummary,
  withoutLiveTradeMatches,
} from "@/lib/trade-derivation";
import { capitalize } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { ContactMethodChips } from "./contact-method-chips";
import { LIST_INTENT_ICON, LIST_INTENT_NOUN, LIST_KIND_NOUN } from "./list-intent-meta";
import { MatchTradeList } from "./match-row-card";
import { ShareListsWithGroupDialog } from "./share-lists-with-group-dialog";
import { TradeValueSummary } from "./trade-row-parts";
import { TradesSection } from "./trades-section";

/**
 * The Trades page: the gold summary band up top, then the sections ordered
 * Action needed → In progress → Possible trades → Wishlists & tradelists →
 * Completed — whatever waits on the viewer first, the match suggestions and
 * the per-member list browser slotted in above Completed by
 * {@link TradesSection}.
 * @returns the trades-page content.
 */
export function TradesPageContent({
  slug,
  data,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
}) {
  return (
    // Card names across the sections below open the detail overlay the provider
    // mounts; there is no grid here, so the browsers' selection store (and its
    // dockable pane) is not what drives it. See CardDetailOverlayProvider.
    <CardDetailOverlayProvider>
      <div className="flex flex-col gap-8">
        <TradesPulse slug={slug} data={data} />
        <TradesSection
          groupId={data.group.id}
          suggestions={<SuggestedSection slug={slug} data={data} />}
          memberLists={<MemberListsSection slug={slug} data={data} />}
        />
      </div>
    </CardDetailOverlayProvider>
  );
}

/**
 * The page's summary band — the same gold trades hub the group overview leads
 * with, so following its "View trades" link lands on a familiar surface. The
 * headline mirrors the overview ({@link tradesHubSummary}); next to it sit
 * jump links to the sections further down, and below it the estimated value
 * across the viewer's open trades in this group.
 * @returns The summary band.
 */
function TradesPulse({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: tradesData } = useGroupTrades(data.group.id);
  const { data: allTradesData } = useUserTrades();
  const prices = usePrices();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");

  const trades = tradesData?.items ?? [];
  const actionNeeded = trades.filter((trade) => tradeSection(trade) === "action-needed");
  const active = trades.filter((trade) => tradeSection(trade) === "active");
  const history = trades.filter((trade) => tradeSection(trade) === "history");
  // The same suggestion count the Possible trades section renders below.
  // Deduped against the viewer's trades across all groups (falling back to the
  // group's own until loaded), so a request opened with the same member in
  // another shared group doesn't count as a suggestion here.
  const liveTrades = allTradesData?.items ?? trades;
  const matchCount = countTradeSuggestions(
    withoutLiveTradeMatches(matches.othersHaveYourWants, liveTrades),
    withoutLiveTradeMatches(matches.othersWantYourHaves, liveTrades),
  );
  const sharedListCount = data.shares.filter(
    (share) => share.listIntent === "wish" || share.listIntent === "trade",
  ).length;

  const { headline, sub } = tradesHubSummary(actionNeeded.length, matchCount, active.length);
  const split = sumTradeValues([...actionNeeded, ...active], (printingId) =>
    prices.get(printingId, marketplace),
  );

  return (
    <ActionBand
      icon={ZapIcon}
      accent={actionNeeded.length > 0}
      label="Trades"
      value={headline}
      sub={sub}
      action={
        // Jump links are a shortcut, not the only path to the sections, so
        // they yield entirely to the headline on phones instead of squeezing it.
        <span className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
          <JumpLink target="possible-trades" label="Possible trades" count={matchCount} />
          <JumpLink target="shared-lists" label="Shared lists" count={sharedListCount} />
          {history.length > 0 ? (
            <JumpLink target="completed-trades" label="Completed" count={history.length} />
          ) : null}
        </span>
      }
    >
      {/* pl-13 = the chip (size-10) plus the row gap, aligning under the label. */}
      <TradeValueSummary split={split} marketplace={marketplace} className="pl-13" />
    </ActionBand>
  );
}

/**
 * An in-page jump link on the summary band, targeting one of the page's
 * section anchors (which carry matching `scroll-mt` clearance for the sticky
 * bars).
 * @returns The link, styled as a small outline button.
 */
function JumpLink({ target, label, count }: { target: string; label: string; count: number }) {
  return (
    <Button
      variant="outline"
      size="sm"
      // The label lives in the Button's children, which the lint rules can't see through.
      // oxlint-disable-next-line jsx-a11y/control-has-associated-label, jsx-a11y/anchor-has-content -- text label is inside the Button children
      render={<a href={`#${target}`} />}
    >
      {label}
      <span className="text-muted-foreground text-xs tabular-nums">({count})</span>
    </Button>
  );
}

function SuggestedSection({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: tradesData } = useGroupTrades(data.group.id);
  const { data: allTradesData } = useUserTrades();

  // Hide a suggestion once it has a live (pending/reserved) trade with the same
  // member for the same card — in this group (where it echoes the in-progress
  // trade below) or in any other shared group (where the request already
  // exists, so acting on the suggestion would just 409). Falls back to the
  // group's own trades until the all-groups list loads.
  const liveTrades = allTradesData?.items ?? tradesData?.items ?? [];
  const incoming = withoutLiveTradeMatches(matches.othersHaveYourWants, liveTrades);
  const outgoing = withoutLiveTradeMatches(matches.othersWantYourHaves, liveTrades);
  const hasMatches = incoming.length > 0 || outgoing.length > 0;

  return (
    <section id="possible-trades" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHeading
        icon={SparklesIcon}
        tone="green"
        count={countTradeSuggestions(incoming, outgoing)}
      >
        Possible trades
      </SectionHeading>
      {hasMatches ? (
        <MatchTradeList incoming={incoming} outgoing={outgoing} groupSlug={slug} />
      ) : (
        <SuggestedEmptyState slug={slug} data={data} />
      )}
    </section>
  );
}

function SuggestedEmptyState({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const viewerShares = data.shares.filter((share) => share.userId === viewerId);
  const othersShare = data.shares.some((share) => share.userId !== viewerId);
  const viewerSharesTradable = viewerShares.some(
    (share) => share.listIntent === "wish" || share.listIntent === "trade",
  );

  if (!othersShare && viewerSharesTradable) {
    return (
      <EmptyState
        className="py-10"
        icon={HandshakeIcon}
        title="No shared lists in this group yet"
        description="Ask members to share a wishlist or tradelist to start seeing trades."
      />
    );
  }
  if (!viewerSharesTradable) {
    return <ShareYourListsPrompt slug={slug} />;
  }
  return (
    <EmptyState
      className="py-10"
      icon={HandshakeIcon}
      title="No matches right now"
      description="You'll see possible trades here when your wants and haves overlap with another member's."
    />
  );
}

/**
 * Shown when the viewer has no wish/trade list shared with this group — the
 * state every confused "why is this empty?" member lands in. Explains why
 * there are no matches and offers a one-click share for each of their
 * unshared wish/trade lists, right here instead of on the Manage page.
 * @returns The prompt node.
 */
function ShareYourListsPrompt({ slug }: { slug: string }) {
  const { data } = useFriendGroupShareableLists(slug);
  const share = useShareListWithFriendGroup();

  const candidates = data.items.filter(
    (item) => (item.listIntent === "wish" || item.listIntent === "trade") && item.sharedAt === null,
  );

  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground">
        You don&apos;t have a wishlist or tradelist yet.{" "}
        <Link to="/collections" className="text-foreground underline underline-offset-4">
          Create one
        </Link>{" "}
        and then share it with this group to start finding trades.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed p-4">
      <p className="text-muted-foreground">
        This group can&apos;t see any of your lists yet, so there are no matches. Share a wishlist
        or tradelist to let members find trades with you.
      </p>
      <ul className="flex flex-col gap-2">
        {candidates.map((item) => (
          <li key={item.listId} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              {item.listIntent === "wish" ? (
                <HeartIcon className="text-muted-foreground size-4 shrink-0" />
              ) : (
                <HandshakeIcon className="text-muted-foreground size-4 shrink-0" />
              )}
              <span className="truncate font-medium">{item.listName}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {item.entryCount} {item.entryCount === 1 ? "card" : "cards"}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => share.mutate({ slug, listId: item.listId })}
              disabled={share.isPending}
            >
              <Share2Icon className="size-4" />
              Share
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface OwnerLists {
  member: FriendGroupMemberResponse;
  lists: FriendGroupShareResponse[];
}

/**
 * Each member's shared wishlists and tradelists as a card per member (the
 * viewer first, then alphabetically), the member's lists as rows inside their
 * card. The viewer's card is always shown — even with nothing shared — and
 * carries an inline "Share more" button that opens the share dialog.
 * @returns The wishlists-and-tradelists section.
 */
function MemberListsSection({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  // Group each member's shared wishlists/tradelists under the member, joined to
  // the roster for the avatar/nickname. Anonymous owners and members with
  // nothing shared fall away — except the viewer, whose row is always shown so
  // they have a stable place to share from.
  const membersById = new Map(data.members.map((member) => [member.userId, member]));
  const byOwner = new Map<string, OwnerLists>();
  const bucketFor = (userId: string): OwnerLists | undefined => {
    const member = membersById.get(userId);
    if (!member) {
      return undefined;
    }
    let bucket = byOwner.get(userId);
    if (!bucket) {
      bucket = { member, lists: [] };
      byOwner.set(userId, bucket);
    }
    return bucket;
  };
  for (const share of data.shares) {
    if (share.listIntent === "wish" || share.listIntent === "trade") {
      bucketFor(share.userId)?.lists.push(share);
    }
  }
  // Always keep the viewer's own row, even when they've shared nothing yet.
  bucketFor(viewerId);
  // The viewer first (their lists are the ones they can act on), then the rest
  // alphabetically. Other members with nothing shared are dropped.
  const owners = [...byOwner.values()]
    .filter((owner) => owner.lists.length > 0 || owner.member.userId === viewerId)
    .sort((a, b) => {
      if (a.member.userId === viewerId) {
        return -1;
      }
      if (b.member.userId === viewerId) {
        return 1;
      }
      const aName = a.member.userName ?? "￿";
      const bName = b.member.userName ?? "￿";
      return aName.localeCompare(bName);
    });

  const sharedListCount = data.shares.filter(
    (share) => share.listIntent === "wish" || share.listIntent === "trade",
  ).length;

  return (
    <section id="shared-lists" className="flex scroll-mt-28 flex-col gap-3">
      <SectionHeading icon={HeartIcon} tone="sky" count={sharedListCount}>
        Wishlists &amp; tradelists
      </SectionHeading>
      {owners.length === 0 ? (
        <p className="text-muted-foreground">
          No members have shared a wishlist or tradelist with this group yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {owners.map(({ member, lists }) => (
            <MemberListsCard
              key={member.userId}
              slug={slug}
              member={member}
              lists={lists}
              // The viewer's card carries the share entry point; it only
              // renders a button when there's actually something left to share.
              shareButton={
                member.userId === viewerId ? (
                  <Suspense fallback={null}>
                    <ShareMoreButton slug={slug} groupName={data.group.name} />
                  </Suspense>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One member's card in the Wishlists & tradelists grid: avatar and name up
 * top, their contact chips, then their shared lists as rows behind a fold. The
 * lists start closed so a group of a dozen members reads as a scannable grid of
 * people rather than a wall of list rows; the fold's label carries the count so
 * the closed card still says how much is there. The name links to the member's
 * page, so it stays out of the fold trigger. Only the viewer's own card can be
 * list-less (other members without shares are filtered out upstream), so the
 * empty text speaks to the viewer.
 * @returns The member card.
 */
function MemberListsCard({
  slug,
  member,
  lists,
  shareButton,
}: {
  slug: string;
  member: FriendGroupMemberResponse;
  lists: FriendGroupShareResponse[];
  /** The viewer's "Share more" entry point; null on other members' cards. */
  shareButton: ReactNode;
}) {
  return (
    <Card className="gap-2.5 p-4">
      <div className="flex items-center gap-2.5">
        <UserAvatar
          image={member.userImage}
          name={member.userName}
          gravatarHash={member.gravatarHash}
          size="sm"
        />
        <Link
          to="/groups/$slug/members/$userId"
          params={{ slug, userId: member.userId }}
          className="hover:text-primary min-w-0 flex-1 truncate font-medium transition-colors"
        >
          {member.userName ?? "Member"}
        </Link>
        {shareButton}
      </div>
      <ContactMethodChips methods={member.contactMethods} />
      {lists.length === 0 ? (
        <p className="text-muted-foreground">
          You haven&apos;t shared a wishlist or tradelist with this group yet.
        </p>
      ) : (
        <Collapsible className="-mx-2">
          <CollapsibleTrigger className="group hover:bg-muted/50 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left">
            <span className="min-w-0 flex-1 truncate text-sm">
              {lists.length} shared {lists.length === 1 ? "list" : "lists"}
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="flex flex-col">
              {lists.map((share) => (
                <li key={share.listId}>
                  <MemberListRow slug={slug} share={share} />
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}

/**
 * One shared list inside a member's card: a round intent chip, the list name
 * with its kind and count, and a chevron — the whole row links to the shared
 * list view. Follows the overview rail's row look rather than nesting
 * SharedListRow's Card inside the member card.
 * @returns The list row link.
 */
function MemberListRow({ slug, share }: { slug: string; share: FriendGroupShareResponse }) {
  const noun =
    share.entryCount === 1
      ? LIST_KIND_NOUN[share.listKind].singular
      : LIST_KIND_NOUN[share.listKind].plural;
  return (
    <Link
      to="/groups/$slug/lists/$listId"
      params={{ slug, listId: share.listId }}
      search={{ fromUser: share.userId }}
      className="hover:bg-muted/50 flex items-center gap-2.5 rounded-md px-2 py-1.5"
    >
      <IconChip icon={LIST_INTENT_ICON[share.listIntent]} size="sm" shape="round" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{share.listName}</span>
        <span className="text-muted-foreground truncate text-xs">
          {capitalize(LIST_INTENT_NOUN[share.listIntent])} · {share.entryCount} {noun.toLowerCase()}
        </span>
      </span>
      <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
}

/**
 * The viewer's "Share more" button next to their own row. Renders nothing when
 * they have no unshared wishlist or tradelist left, so it never opens a
 * dead-end "you've already shared everything" dialog. Reads the shareable-lists
 * query, so it must be wrapped in a Suspense boundary.
 * @returns The share button and its dialog, or null when nothing is shareable.
 */
function ShareMoreButton({ slug, groupName }: { slug: string; groupName: string }) {
  const { data } = useFriendGroupShareableLists(slug);
  const [open, setOpen] = useState(false);

  const hasShareable = data.items.some(
    (item) => (item.listIntent === "wish" || item.listIntent === "trade") && item.sharedAt === null,
  );
  if (!hasShareable) {
    return null;
  }

  return (
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
  );
}
