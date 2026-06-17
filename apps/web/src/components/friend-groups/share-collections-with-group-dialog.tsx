import { Link } from "@tanstack/react-router";
import { BookOpenIcon } from "lucide-react";
import { Suspense, useState } from "react";

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
import {
  useFriendGroupShareableCollections,
  useShareCollectionWithFriendGroup,
} from "@/hooks/use-friend-groups";

/**
 * Picks which of the viewer's personal collections a group can see, the
 * collection counterpart to {@link import("./share-lists-with-group-dialog").ShareListsWithGroupDialog}.
 * Lists every collection the viewer hasn't shared yet, pre-selected so the
 * common "share them all" case is one confirm.
 * @returns The dialog node.
 */
export function ShareCollectionsWithGroupDialog({
  slug,
  groupName,
  open,
  onOpenChange,
  cancelLabel = "Cancel",
  preselectAll = false,
}: {
  slug: string;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Footer dismiss label. */
  cancelLabel?: string;
  /** Whether to start with every candidate checked. Off for "Share more". */
  preselectAll?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share collections with {groupName}?</DialogTitle>
          <DialogDescription>
            Pick the collections this group can see. Shared collections are read-only for other
            members, and you can change this anytime from the group&apos;s manage page.
          </DialogDescription>
        </DialogHeader>
        <Suspense
          fallback={
            <div className="text-muted-foreground py-4 text-sm">Loading your collections…</div>
          }
        >
          <ShareCollectionsBody
            slug={slug}
            onOpenChange={onOpenChange}
            cancelLabel={cancelLabel}
            preselectAll={preselectAll}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function ShareCollectionsBody({
  slug,
  onOpenChange,
  cancelLabel,
  preselectAll,
}: {
  slug: string;
  onOpenChange: (open: boolean) => void;
  cancelLabel: string;
  preselectAll: boolean;
}) {
  const { data } = useFriendGroupShareableCollections(slug);
  const share = useShareCollectionWithFriendGroup();

  const candidates = data.items.filter((item) => item.sharedAt === null);

  // "Share more" starts empty so the member picks what to add; callers that want
  // a one-click "share them all" can opt in with preselectAll.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(preselectAll ? candidates.map((item) => item.collectionId) : []),
  );

  if (candidates.length === 0) {
    return (
      <>
        <p className="text-muted-foreground">
          {data.items.length === 0 ? (
            <>
              You don&apos;t have a collection to share yet.{" "}
              <Link to="/collections" className="text-foreground underline underline-offset-4">
                Create one
              </Link>{" "}
              and you can share it with this group from its manage page.
            </>
          ) : (
            "You've already shared all your collections with this group."
          )}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }

  const handleShare = async () => {
    const toShare = candidates.filter((item) => selectedIds.has(item.collectionId));
    await Promise.allSettled(
      toShare.map((item) => share.mutateAsync({ slug, collectionId: item.collectionId })),
    );
    onOpenChange(false);
  };

  return (
    <>
      <ul className="flex flex-col gap-2">
        {candidates.map((item) => {
          const checkboxId = `share-collection-${item.collectionId}`;
          const isSelected = selectedIds.has(item.collectionId);
          return (
            <li key={item.collectionId} className="flex items-center gap-3">
              <Checkbox
                id={checkboxId}
                checked={isSelected}
                disabled={share.isPending}
                onCheckedChange={(checked) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (checked === false) {
                      next.delete(item.collectionId);
                    } else {
                      next.add(item.collectionId);
                    }
                    return next;
                  });
                }}
              />
              <label
                htmlFor={checkboxId}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
              >
                <BookOpenIcon className="text-muted-foreground size-4 shrink-0" />
                <span className="truncate font-medium">{item.collectionName}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={share.isPending}>
          {cancelLabel}
        </Button>
        <Button onClick={handleShare} disabled={share.isPending || selectedIds.size === 0}>
          {selectedIds.size === 1 ? "Share 1 collection" : `Share ${selectedIds.size} collections`}
        </Button>
      </DialogFooter>
    </>
  );
}
