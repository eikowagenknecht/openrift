import { CatchBoundary } from "@tanstack/react-router";
import { LinkIcon, PrinterIcon, Trash2Icon } from "lucide-react";
import { Suspense, useState } from "react";

import { BinderSheetDialog } from "@/components/share/binder-sheet-dialog";
import { ShareLinkRow } from "@/components/share/share-link-row";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { useCollectionGroupShares } from "@/hooks/use-collection-group-shares";
import { useShareCollection, useUnshareCollection } from "@/hooks/use-collections";
import {
  useFriendGroups,
  useShareCollectionWithFriendGroup,
  useUnshareCollectionFromFriendGroup,
} from "@/hooks/use-friend-groups";
import { getSiteUrl } from "@/lib/site-config";

interface CollectionShareDialogProps {
  collectionId: string;
  /** Prefills the binder sheet's title. */
  collectionName: string;
  isPublic: boolean;
  shareToken: string | null;
  /**
   * True for a group-owned (pooled) collection. Suppresses the friend-group
   * panel, which only applies to a personal binder the viewer owns.
   */
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
  const [binderSheetOpen, setBinderSheetOpen] = useState(false);

  const shareUrl = shareToken ? `${getSiteUrl()}/collections/share/${shareToken}` : null;
  const sharing = isPublic && shareToken !== null;

  // Enter creates the link when none exists yet. Once a link is present the
  // footer shows Stop sharing (destructive) and Copy, with no single default,
  // so implicit submission must not re-trigger a share.
  const handleSubmit = () => {
    if (sharing || shareCollection.isPending) {
      return;
    }
    shareCollection.mutate(collectionId);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogForm onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Share collection</DialogTitle>
              <DialogDescription>
                {sharing
                  ? "Anyone with this link can view this collection, including the card list and its total value."
                  : "Create a link to share this collection. Anyone with the link will be able to view it without signing in."}
              </DialogDescription>
            </DialogHeader>

            {sharing && shareUrl ? (
              <ShareLinkRow url={shareUrl} label="Collection share link" />
            ) : null}

            {sharing && shareUrl ? (
              <div className="flex flex-col gap-2 border-t pt-4">
                <div>
                  <h3 className="font-medium">Print for your binder</h3>
                  <p className="text-muted-foreground text-sm">
                    A QR sheet at true card or binder-page size, so anyone can scan this collection
                    straight out of your binder.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => setBinderSheetOpen(true)}
                >
                  <PrinterIcon />
                  Create PDF
                </Button>
              </div>
            ) : null}

            {/*
              The group panel shares a *personal* binder with a group, so it is
              meaningless for a pooled collection the group already owns. Its
              `groupShares` query 404s on those by design, which used to throw
              out of the suspense query and take the whole route down.
              The boundary keeps any future failure here
              contained to the panel: it is optional chrome, and losing it must
              never cost the viewer their share link.
            */}
            {isGroupCollection ? null : (
              <CatchBoundary getResetKey={() => collectionId} errorComponent={() => null}>
                <Suspense fallback={null}>
                  <CollectionGroupShareSection collectionId={collectionId} />
                </Suspense>
              </CatchBoundary>
            )}

            <DialogFooter>
              {sharing ? (
                <Button
                  variant="destructive"
                  onClick={() => unshareCollection.mutate(collectionId)}
                  disabled={unshareCollection.isPending}
                >
                  <Trash2Icon />
                  Stop sharing
                </Button>
              ) : (
                <Button type="submit" disabled={shareCollection.isPending}>
                  <LinkIcon />
                  Create link
                </Button>
              )}
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      {shareUrl ? (
        <BinderSheetDialog
          open={binderSheetOpen}
          onOpenChange={setBinderSheetOpen}
          shareUrl={shareUrl}
          defaultTitle={collectionName}
          defaultSubtitle="Scan to see my collection"
          filenameHint={collectionName}
        />
      ) : null}
    </>
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
