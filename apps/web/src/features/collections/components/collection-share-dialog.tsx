import { CatchBoundary } from "@tanstack/react-router";
import { Suspense } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { useCollectionGroupShares } from "@/features/collections/hooks/use-collection-group-shares";
import {
  useShareCollection,
  useUnshareCollection,
} from "@/features/collections/hooks/use-collections";
import { ShareDialog } from "@/features/groups/components/share-dialog";
import {
  useFriendGroups,
  useShareCollectionWithFriendGroup,
  useUnshareCollectionFromFriendGroup,
} from "@/features/groups/hooks/use-friend-groups";
import { collectionOwnerImageUrl } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";

interface CollectionShareDialogProps {
  collectionId: string;
  collectionName: string;
  isPublic: boolean;
  shareToken: string | null;
  isGroupCollection: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollectionShareDialog({
  collectionId,
  collectionName,
  isPublic,
  shareToken,
  isGroupCollection,
  open,
  onOpenChange,
}: CollectionShareDialogProps) {
  const shareCollection = useShareCollection();
  const unshareCollection = useUnshareCollection();

  const shareUrl = shareToken ? `${getSiteUrl()}/collections/share/${shareToken}` : null;
  const sharing = isPublic && shareToken !== null;

  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share collection"
      description={
        sharing
          ? "Anyone with this link can view this collection, including the card list and its total value."
          : "Create a link to share this collection. Anyone with the link will be able to view it without signing in."
      }
      link={{
        url: sharing ? shareUrl : null,
        label: "Collection share link",
        onCreate: () => shareCollection.mutate(collectionId),
        creating: shareCollection.isPending,
        onStop: () => unshareCollection.mutate(collectionId),
        stopping: unshareCollection.isPending,
      }}
      image={{
        title: collectionName,
        filenameBase: collectionName || "collection",
        buildUrl: (choice) =>
          collectionOwnerImageUrl(getSiteUrl(), collectionId, {
            size: choice.scale >= 2 ? "hq" : undefined,
            aspect: choice.aspect,
            qr: choice.qr,
          }),
        scales: [1, 2],
        qr: sharing ? "available" : "requires-share",
        qrLabel: "Include a QR code to the collection",
      }}
    >
      {/* groupShares 404s for a pooled collection; the boundary keeps that
          contained to this optional panel instead of failing the dialog. */}
      {isGroupCollection ? null : (
        <CatchBoundary getResetKey={() => collectionId} errorComponent={() => null}>
          <Suspense fallback={null}>
            <CollectionGroupShareSection collectionId={collectionId} />
          </Suspense>
        </CatchBoundary>
      )}
    </ShareDialog>
  );
}

function CollectionGroupShareSection({ collectionId }: { collectionId: string }) {
  const { data: groups } = useFriendGroups();
  const { data: sharedWith } = useCollectionGroupShares(collectionId);
  const share = useShareCollectionWithFriendGroup();
  const unshare = useUnshareCollectionFromFriendGroup();

  if (groups.items.length === 0) {
    return null;
  }

  const sharedSet = new Set(sharedWith.items.map((row) => row.groupId));

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="font-medium">Share with friend groups</h3>
        <p className="text-muted-foreground text-sm">
          Members of the selected groups can view this collection (read-only) while signed in.
        </p>
      </div>
      <ul className="space-y-2">
        {groups.items.map((group) => {
          const isShared = sharedSet.has(group.id);
          const checkboxId = `share-collection-group-${group.id}`;
          return (
            <li key={group.id} className="flex items-center gap-2">
              <Checkbox
                id={checkboxId}
                checked={isShared}
                disabled={share.isPending || unshare.isPending}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    share.mutate({ slug: group.slug, collectionId });
                  } else if (checked === false) {
                    unshare.mutate({ slug: group.slug, collectionId });
                  }
                }}
              />
              <label htmlFor={checkboxId} className="cursor-pointer text-sm">
                {group.name}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
