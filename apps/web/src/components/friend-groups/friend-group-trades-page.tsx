import type {
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupShareResponse,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, HandshakeIcon, HeartIcon, Share2Icon } from "lucide-react";
import { Suspense, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { useGroupTrades } from "@/hooks/use-card-trades";
import {
  useFriendGroupMatches,
  useFriendGroupShareableLists,
  useShareListWithFriendGroup,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { withoutLiveTradeMatches } from "@/lib/trade-derivation";

import { ContactMethodChips } from "./contact-method-chips";
import { MatchTradeList } from "./match-row-card";
import { ShareListsWithGroupDialog } from "./share-lists-with-group-dialog";
import { SharedListRow } from "./shared-list-row";
import { TradesSection } from "./trades-section";

/**
 * The Trades page, ordered In progress → Action needed → Possible trades →
 * Wishlists & tradelists → Completed: the viewer's active trades sit at the top, the
 * match suggestions and the per-member list browser are slotted in above
 * Completed by {@link TradesSection}.
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
    <TradesSection
      groupId={data.group.id}
      suggestions={<SuggestedSection slug={slug} data={data} />}
      memberLists={<MemberListsSection slug={slug} data={data} />}
    />
  );
}

function SuggestedSection({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: tradesData } = useGroupTrades(data.group.id);

  // Hide a suggestion once it has a live (pending/reserved) trade with the same
  // member for the same card, so it doesn't echo the in-progress trade below.
  const trades = tradesData?.items ?? [];
  const incoming = withoutLiveTradeMatches(matches.othersHaveYourWants, trades);
  const outgoing = withoutLiveTradeMatches(matches.othersWantYourHaves, trades);
  const hasMatches = incoming.length > 0 || outgoing.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>Possible trades</SectionHeading>
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
 * Each member's shared wishlists and tradelists, grouped per member (the viewer
 * first, then alphabetically) in a collapsible. Moved here from the Shared page
 * so the Trades page is the single place to browse what members offer and act
 * on it. The viewer's own row is always shown — even with nothing shared — and
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

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Wishlists &amp; tradelists</SectionHeading>
      {owners.length === 0 ? (
        <p className="text-muted-foreground">
          No members have shared a wishlist or tradelist with this group yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {owners.map(({ member, lists }) => {
            const isViewer = member.userId === viewerId;
            // The viewer's row carries the share entry point; it only renders a
            // button when there's actually something left to share.
            const shareButton = isViewer ? (
              <Suspense fallback={null}>
                <ShareMoreButton slug={slug} groupName={data.group.name} />
              </Suspense>
            ) : null;
            if (lists.length === 0) {
              // Only the viewer reaches this — others with nothing shared are
              // filtered out above.
              return (
                <div key={member.userId} className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 font-medium">
                    <UserAvatar
                      image={member.userImage}
                      name={member.userName}
                      gravatarHash={member.gravatarHash}
                      size="sm"
                    />
                    <span className="truncate">{member.userName ?? "Member"}</span>
                    <span className="text-muted-foreground text-xs">(nothing shared yet)</span>
                  </div>
                  {shareButton}
                </div>
              );
            }
            return (
              <Collapsible key={member.userId}>
                <div className="flex items-center gap-2">
                  <CollapsibleTrigger className="group hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium">
                    <UserAvatar
                      image={member.userImage}
                      name={member.userName}
                      gravatarHash={member.gravatarHash}
                      size="sm"
                    />
                    <span className="truncate">{member.userName ?? "Member"}</span>
                    <span className="text-muted-foreground text-xs">({lists.length})</span>
                    <ChevronRightIcon className="text-muted-foreground ml-auto size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
                  </CollapsibleTrigger>
                  {shareButton}
                </div>
                <ContactMethodChips methods={member.contactMethods} className="mt-1 ml-8" />
                <CollapsibleContent>
                  <div className="mt-1 ml-8 flex flex-col gap-2">
                    {lists.map((share) => (
                      <SharedListRow
                        key={share.listId}
                        slug={slug}
                        member={member}
                        share={share}
                        showMember={false}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </section>
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
