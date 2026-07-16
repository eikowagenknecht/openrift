import type {
  CollectionResponse,
  FriendGroupCollectionShareResponse,
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
} from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { PlusIcon, Share2Icon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardFan, CardFanOutline } from "@/components/cards/card-fan";
import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { CoverBand } from "@/components/cover-band";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { CardLink } from "@/components/ui/card-link";
import { CountPill } from "@/components/ui/count-pill";
import { Pressable } from "@/components/ui/pressable";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { useCards } from "@/hooks/use-cards";
import { useCollections } from "@/hooks/use-collections";
import {
  useFriendGroupDetail,
  useFriendGroupShareableCollections,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { deriveCollectionCovers } from "@/lib/collection-cover-art";
import { useCopiesCollection } from "@/lib/copies-collection";

import { ContactMethodChips } from "./contact-method-chips";
import { ShareCollectionsWithGroupDialog } from "./share-collections-with-group-dialog";
import { SharedCollectionRow } from "./shared-collection-row";

/** Max fan slots per group-collection tile (the sm CardFan holds four). */
const TILE_COVER_COUNT = 4;

/**
 * The Collections page: the group's pooled collections as showcase tiles,
 * then each member's own collections shared with the group (grouped under the
 * member). Wishlists and tradelists live on the Trades page, not here.
 * @returns The collections-page content.
 */
export function SharedPageContent({
  slug,
  data,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
}) {
  return (
    <div className="flex flex-col gap-8">
      <GroupCollectionsSection data={data} />
      <MemberSharesSection slug={slug} data={data} />
    </div>
  );
}

/**
 * The Shared page's top-bar action: a button to create a new group-pooled
 * collection, plus the dialog it opens. Reads the (already-loaded) group from
 * the cache so the route can pass it as a plain element. Any member may create a
 * group collection, so it's shown to everyone.
 * @returns The create-collection action.
 */
export function SharedCollectionAction({ slug }: { slug: string }) {
  const { data } = useFriendGroupDetail(slug);
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <PageTopBarPrimaryButton onClick={() => setCreateOpen(true)}>
        <PlusIcon className="size-4" />
        New shared collection
      </PageTopBarPrimaryButton>
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        groupSlug={data.group.slug}
        groupName={data.group.name}
      />
    </>
  );
}

/**
 * Cover art for the group's pooled collections, derived from the synced copies
 * store (group-owned copies sync alongside personal ones) and resolved to
 * front-image fan covers. Ranking mirrors the server-side covers on member
 * shares: most-copies-first. Skipped during SSR — like the hero's fan, the art
 * appears after hydration; the tiles render with outline fans until then.
 * @returns Fan covers keyed by collection id.
 */
function useGroupCollectionCoverFans(): Map<string, { key: string; imageId: string }[]> {
  const copiesCollection = useCopiesCollection();
  const { printingsById } = useCards();
  // The same SSR/sign-out guard as useCollections: a null query on the server
  // (no server snapshot) and mid-sign-out (collection evicted).
  const { data: copies } = useLiveQuery(
    (q) =>
      globalThis.window === undefined || !copiesCollection
        ? null
        : q.from({ copy: copiesCollection }),
    [copiesCollection],
  );
  const covers = deriveCollectionCovers(copies ?? [], TILE_COVER_COUNT);
  return new Map(
    [...covers].map(([collectionId, printingIds]) => [
      collectionId,
      printingIds.flatMap((printingId) => {
        const imageId = printingsById[printingId]?.images.find(
          (image) => image.face === "front",
        )?.imageId;
        return imageId ? [{ key: printingId, imageId }] : [];
      }),
    ]),
  );
}

function GroupCollectionsSection({ data }: { data: FriendGroupDetailResponse }) {
  const { data: collections } = useCollections();
  const groupCollections = collections.filter((col) => col.groupId === data.group.id);
  const coverFans = useGroupCollectionCoverFans();

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Group collections</SectionHeading>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groupCollections.map((col) => (
          <li key={col.id}>
            <GroupCollectionTile collection={col} covers={coverFans.get(col.id) ?? []} />
          </li>
        ))}
        <li>
          <NewCollectionTile group={data.group} />
        </li>
      </ul>
    </section>
  );
}

/**
 * One pooled collection as a showcase tile: the warm-glow cover band with a
 * fan of the collection's own card art (dashed outlines while it's empty),
 * then the name and copy count. The same tile grammar as the groups index and
 * the products page.
 * @returns The tile element.
 */
function GroupCollectionTile({
  collection,
  covers,
}: {
  collection: CollectionResponse;
  covers: { key: string; imageId: string }[];
}) {
  const noun = collection.copyCount === 1 ? "copy" : "copies";
  return (
    <CardLink
      render={
        <Link
          to="/collections/$collectionId"
          params={{ collectionId: collection.id }}
          search={(prev) => prev}
        />
      }
      className="flex-col gap-0 py-0"
    >
      {/* overflow-hidden crops the fan's bottom bleed at the band edge, so
          the rotated card corners never paint over the name below. */}
      <CoverBand aria-hidden="true" className="h-32 overflow-hidden">
        {covers.length === 0 ? <CardFanOutline /> : <CardFan covers={covers} />}
      </CoverBand>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-4">
        <span className="truncate font-medium">{collection.name}</span>
        <span className="text-muted-foreground text-xs">
          {collection.copyCount} {noun}
        </span>
      </div>
    </CardLink>
  );
}

/**
 * The dashed create tile at the end of the pooled-collections grid. Doubles
 * as the section's empty state: when the group has no collections yet, this
 * tile alone explains what a pooled collection is.
 * @returns The tile and its create dialog.
 */
function NewCollectionTile({ group }: { group: FriendGroupDetailResponse["group"] }) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <Pressable
        onClick={() => setCreateOpen(true)}
        className="border-border hover:border-primary/40 text-muted-foreground hover:text-foreground flex h-full min-h-44 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-6 text-center transition-colors"
      >
        <PlusIcon aria-hidden="true" className="size-6" />
        <span className="text-foreground text-sm font-medium">New shared collection</span>
        <span className="text-xs">
          A pooled inventory the whole group can add to and remove from.
        </span>
      </Pressable>
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        groupSlug={group.slug}
        groupName={group.name}
      />
    </>
  );
}

interface OwnerShares {
  member: FriendGroupMemberResponse;
  collections: FriendGroupCollectionShareResponse[];
}

function MemberSharesSection({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  // Group each member's shared collections under the member, joined to the
  // roster for the avatar/nickname. Wishlists and tradelists live on the Trades
  // page. Anonymous owners and members with nothing shared fall away — except
  // the viewer, whose block is always shown so they have a stable place to
  // share from.
  const membersById = new Map(data.members.map((member) => [member.userId, member]));
  const byOwner = new Map<string, OwnerShares>();
  const bucketFor = (userId: string): OwnerShares | undefined => {
    const member = membersById.get(userId);
    if (!member) {
      return undefined;
    }
    let bucket = byOwner.get(userId);
    if (!bucket) {
      bucket = { member, collections: [] };
      byOwner.set(userId, bucket);
    }
    return bucket;
  };
  for (const share of data.collectionShares) {
    bucketFor(share.userId)?.collections.push(share);
  }
  // Always keep the viewer's own block, even when they've shared nothing yet.
  bucketFor(viewerId);
  // The viewer first (their shares are the ones they can act on), then the
  // rest alphabetically. Other members with nothing shared are dropped.
  const owners = [...byOwner.values()]
    .filter((owner) => owner.collections.length > 0 || owner.member.userId === viewerId)
    .sort((a, b) => {
      if (a.member.userId !== b.member.userId) {
        if (a.member.userId === viewerId) {
          return -1;
        }
        if (b.member.userId === viewerId) {
          return 1;
        }
      }
      const aName = a.member.userName ?? "￿";
      const bName = b.member.userName ?? "￿";
      return aName.localeCompare(bName);
    });

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Member collections</SectionHeading>
      {owners.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No members have shared a collection with this group yet. Wishlists and tradelists live on
          the Trades page.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {owners.map(({ member, collections }) => (
            <MemberSharesBlock
              key={member.userId}
              slug={slug}
              groupName={data.group.name}
              member={member}
              collections={collections}
              isViewer={member.userId === viewerId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One member's shares: a header row (avatar, name, count, contact chips, and
 * the viewer's share entry point) over the bordered list of their shared
 * collections — always visible, replacing the old collapsed-by-default fold.
 * @returns The member block.
 */
function MemberSharesBlock({
  slug,
  groupName,
  member,
  collections,
  isViewer,
}: {
  slug: string;
  groupName: string;
  member: FriendGroupMemberResponse;
  collections: FriendGroupCollectionShareResponse[];
  isViewer: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2 px-0.5">
        <UserAvatar
          image={member.userImage}
          name={member.userName}
          gravatarHash={member.gravatarHash}
          size="sm"
        />
        <span className="truncate font-medium">{member.userName ?? "Member"}</span>
        {collections.length > 0 ? (
          <CountPill>{collections.length}</CountPill>
        ) : (
          <span className="text-muted-foreground text-xs">nothing shared yet</span>
        )}
        {isViewer ? (
          <span className="ml-auto shrink-0">
            {/* Only renders a button when there's a collection left to share. */}
            <Suspense fallback={null}>
              <ShareMoreButton slug={slug} groupName={groupName} />
            </Suspense>
          </span>
        ) : null}
      </div>
      <ContactMethodChips methods={member.contactMethods} className="-mt-1 ml-8" />
      {collections.length > 0 ? (
        <ul className="ring-foreground/10 bg-card flex flex-col rounded-lg p-1.5 ring-1">
          {collections.map((share) => (
            <li key={share.collectionId}>
              <SharedCollectionRow slug={slug} share={share} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The viewer's "Share more" button next to their own block. Renders nothing
 * when they have no unshared collection left, so it never opens a dead-end
 * "you've already shared everything" dialog. Reads the shareable-collections
 * query, so it must be wrapped in a Suspense boundary.
 * @returns The share button and its dialog, or null when nothing is shareable.
 */
function ShareMoreButton({ slug, groupName }: { slug: string; groupName: string }) {
  const { data } = useFriendGroupShareableCollections(slug);
  const [open, setOpen] = useState(false);

  const hasShareable = data.items.some((item) => item.sharedAt === null);
  if (!hasShareable) {
    return null;
  }

  return (
    <>
      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setOpen(true)}>
        <Share2Icon />
        Share more
      </Button>
      <ShareCollectionsWithGroupDialog
        slug={slug}
        groupName={groupName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
