import type {
  FriendGroupCollectionShareResponse,
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, PlusIcon, Share2Icon } from "lucide-react";
import { Suspense, useState } from "react";

import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { UserAvatar } from "@/components/user-avatar";
import { useCollections } from "@/hooks/use-collections";
import {
  useFriendGroupDetail,
  useFriendGroupShareableCollections,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";

import { ContactMethodChips } from "./contact-method-chips";
import { SECTION_HEADING } from "./friend-group-shell";
import { ShareCollectionsWithGroupDialog } from "./share-collections-with-group-dialog";
import {
  COLLECTION_ROW_CLASS,
  CollectionRowContent,
  SharedCollectionRow,
} from "./shared-collection-row";

/**
 * The Collections page: the group's pooled collections, then each member's own
 * collections shared with the group (grouped under the member). Wishlists and
 * tradelists live on the Trades page, not here.
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

function GroupCollectionsSection({ data }: { data: FriendGroupDetailResponse }) {
  const { data: collections } = useCollections();
  const groupCollections = collections.filter((col) => col.groupId === data.group.id);

  return (
    <section className="flex flex-col gap-3">
      <h2 className={SECTION_HEADING}>Group collections</h2>
      {groupCollections.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No group collections yet. Any member can create one. A group collection is a pooled
          inventory the whole group can add to and remove from.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groupCollections.map((col) => (
            <li key={col.id}>
              <Link
                to="/collections/$collectionId"
                params={{ collectionId: col.id }}
                search={(prev) => prev}
                className="block"
              >
                <Card className={COLLECTION_ROW_CLASS}>
                  <CollectionRowContent
                    name={col.name}
                    subtitle={`Group collection · ${col.copyCount} ${col.copyCount === 1 ? "Copy" : "Copies"}`}
                  />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
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
  // the viewer, whose row is always shown so they have a stable place to share
  // from.
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
  // Always keep the viewer's own row, even when they've shared nothing yet.
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
      <h2 className={SECTION_HEADING}>Member collections</h2>
      {owners.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No members have shared a collection with this group yet. You can share one of yours from
          Manage. Wishlists and tradelists live on the Trades page.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {owners.map(({ member, collections }) => {
            const isViewer = member.userId === viewerId;
            // The viewer's row carries the share entry point; it only renders a
            // button when there's actually a collection left to share.
            const shareButton = isViewer ? (
              <Suspense fallback={null}>
                <ShareMoreButton slug={slug} groupName={data.group.name} />
              </Suspense>
            ) : null;
            if (collections.length === 0) {
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
                    <span className="text-muted-foreground text-xs">({collections.length})</span>
                    <ChevronRightIcon className="text-muted-foreground ml-auto size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
                  </CollapsibleTrigger>
                  {shareButton}
                </div>
                <ContactMethodChips methods={member.contactMethods} className="mt-1 ml-8" />
                <CollapsibleContent>
                  <div className="mt-1 ml-8 flex flex-col gap-2">
                    {collections.map((share) => (
                      <SharedCollectionRow key={share.collectionId} slug={slug} share={share} />
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
 * they have no unshared collection left, so it never opens a dead-end "you've
 * already shared everything" dialog. Reads the shareable-collections query, so
 * it must be wrapped in a Suspense boundary.
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
