import type {
  FriendGroupCollectionShareResponse,
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupShareResponse,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { BookOpenIcon, ChevronDownIcon, PlusIcon, Share2Icon } from "lucide-react";
import { useState } from "react";

import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { UserAvatar } from "@/components/user-avatar";
import { useCollections } from "@/hooks/use-collections";
import { useRequiredUserId } from "@/lib/auth-session";

import { SECTION_HEADING } from "./friend-group-shell";
import { SharedCollectionRow } from "./shared-collection-row";
import { SharedListRow } from "./shared-list-row";

/**
 * The Shared page: the group's pooled collections, then each member's own
 * collections and lists shared with the group (grouped under the member).
 * @returns The shared-page content.
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

function GroupCollectionsSection({ data }: { data: FriendGroupDetailResponse }) {
  const { data: collections } = useCollections();
  const [createOpen, setCreateOpen] = useState(false);
  const groupCollections = collections.filter((col) => col.groupId === data.group.id);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className={SECTION_HEADING}>Group collections</h2>
        <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          New shared collection
        </Button>
      </div>
      {groupCollections.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No group collections yet. Any member can create one. A group collection is a pooled
          inventory the whole group can add to and remove from.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {groupCollections.map((col) => (
            <li key={col.id}>
              <Link
                to="/collections/$collectionId"
                params={{ collectionId: col.id }}
                search={(prev) => prev}
                className="hover:bg-muted/50 flex items-center gap-2 rounded-md px-3 py-2"
              >
                <BookOpenIcon className="size-4" />
                <span className="flex-1 truncate">{col.name}</span>
                {col.copyCount > 0 ? (
                  <Badge variant="ghost" className="text-2xs">
                    {col.copyCount}
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        groupSlug={data.group.slug}
        groupName={data.group.name}
      />
    </section>
  );
}

interface OwnerShares {
  member: FriendGroupMemberResponse;
  collections: FriendGroupCollectionShareResponse[];
  lists: FriendGroupShareResponse[];
}

function MemberSharesSection({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  // Group each member's shared collections and wishlists/tradelists under the
  // member, joined to the roster for the avatar/nickname. Anonymous owners and
  // members with nothing shared fall away.
  const membersById = new Map(data.members.map((member) => [member.userId, member]));
  const byOwner = new Map<string, OwnerShares>();
  const bucketFor = (userId: string): OwnerShares | undefined => {
    const member = membersById.get(userId);
    if (!member) {
      return undefined;
    }
    let bucket = byOwner.get(userId);
    if (!bucket) {
      bucket = { member, collections: [], lists: [] };
      byOwner.set(userId, bucket);
    }
    return bucket;
  };
  for (const share of data.collectionShares) {
    bucketFor(share.userId)?.collections.push(share);
  }
  for (const share of data.shares) {
    if (share.listIntent === "wish" || share.listIntent === "trade") {
      bucketFor(share.userId)?.lists.push(share);
    }
  }
  // The viewer first (their shares are the ones they can act on), then the
  // rest alphabetically.
  const owners = [...byOwner.values()]
    .filter((owner) => owner.collections.length > 0 || owner.lists.length > 0)
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
      <h2 className={SECTION_HEADING}>Member collections and lists</h2>
      {owners.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No members have shared a collection or list with this group yet. You can share one of
          yours from Manage.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {owners.map(({ member, collections, lists }) => (
            <Collapsible key={member.userId}>
              <div className="flex items-center gap-2">
                <CollapsibleTrigger className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium">
                  <UserAvatar
                    image={member.userImage}
                    name={member.userName}
                    gravatarHash={member.gravatarHash}
                    size="sm"
                  />
                  <span className="truncate">{member.userName ?? "Member"}</span>
                  {member.nickname ? (
                    <span className="text-muted-foreground text-xs">{member.nickname}</span>
                  ) : null}
                  <span className="text-muted-foreground text-xs">
                    ({collections.length + lists.length})
                  </span>
                  <ChevronDownIcon className="text-muted-foreground ml-auto size-4 shrink-0 transition-transform data-[panel-open]:rotate-180" />
                </CollapsibleTrigger>
                {member.userId === viewerId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    render={<Link to="/groups/$slug/manage" params={{ slug }} />}
                  >
                    <Share2Icon />
                    Share more
                  </Button>
                ) : null}
              </div>
              <CollapsibleContent>
                <div className="mt-1 ml-8 flex flex-col gap-2">
                  {collections.map((share) => (
                    <SharedCollectionRow key={share.collectionId} slug={slug} share={share} />
                  ))}
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
          ))}
        </div>
      )}
    </section>
  );
}
