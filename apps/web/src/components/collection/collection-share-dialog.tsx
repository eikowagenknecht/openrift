import { CheckIcon, CopyIcon, LinkIcon, Trash2Icon } from "lucide-react";
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
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
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
  isPublic: boolean;
  shareToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollectionShareDialog({
  collectionId,
  isPublic,
  shareToken,
  open,
  onOpenChange,
}: CollectionShareDialogProps) {
  const shareCollection = useShareCollection();
  const unshareCollection = useUnshareCollection();
  const [justCopied, setJustCopied] = useState(false);

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

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setJustCopied(true);
      globalThis.setTimeout(() => setJustCopied(false), 1500);
    } catch {
      // Ignore clipboard errors — rare, and the user can still select the text.
    }
  };

  return (
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
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
              <Button variant="outline" onClick={handleCopy}>
                {justCopied ? <CheckIcon /> : <CopyIcon />}
                {justCopied ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : null}

          <Suspense fallback={null}>
            <CollectionGroupShareSection collectionId={collectionId} />
          </Suspense>

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
