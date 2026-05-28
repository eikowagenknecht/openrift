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
import { Input } from "@/components/ui/input";
import {
  useFriendGroups,
  useShareListWithFriendGroup,
  useUnshareListFromFriendGroup,
} from "@/hooks/use-friend-groups";
import { useListGroupShares } from "@/hooks/use-list-group-shares";
import { useShareList, useUnshareList } from "@/hooks/use-lists";
import { getSiteUrl } from "@/lib/site-config";

interface ListShareDialogProps {
  listId: string;
  shareToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ListShareDialog({ listId, shareToken, open, onOpenChange }: ListShareDialogProps) {
  const shareList = useShareList();
  const unshareList = useUnshareList();
  const [justCopied, setJustCopied] = useState(false);

  const shareUrl = shareToken ? `${getSiteUrl()}/lists/share/${shareToken}` : null;
  const sharing = shareToken !== null;

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
        <DialogHeader>
          <DialogTitle>Share list</DialogTitle>
          <DialogDescription>
            {sharing
              ? "Anyone with this link can view the cards on this list."
              : "Create a link to share this list. Anyone with the link will be able to view it without signing in."}
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
          <ListGroupShareSection listId={listId} />
        </Suspense>

        <DialogFooter>
          {sharing ? (
            <Button
              variant="destructive"
              onClick={() => unshareList.mutate(listId)}
              disabled={unshareList.isPending}
            >
              <Trash2Icon />
              Stop sharing
            </Button>
          ) : (
            <Button onClick={() => shareList.mutate(listId)} disabled={shareList.isPending}>
              <LinkIcon />
              Create link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListGroupShareSection({ listId }: { listId: string }) {
  const { data: groups } = useFriendGroups();
  const { data: sharedWith } = useListGroupShares(listId);
  const share = useShareListWithFriendGroup();
  const unshare = useUnshareListFromFriendGroup();

  if (groups.items.length === 0) {
    return null;
  }

  const sharedSet = new Set(sharedWith.items.map((row) => row.groupId));

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="font-medium">Share with friend groups</h3>
        <p className="text-muted-foreground text-sm">
          Members of the selected groups can view this list while signed in.
        </p>
      </div>
      <ul className="space-y-2">
        {groups.items.map((group) => {
          const isShared = sharedSet.has(group.id);
          const checkboxId = `share-list-group-${group.id}`;
          return (
            <li key={group.id} className="flex items-center gap-2">
              <Checkbox
                id={checkboxId}
                checked={isShared}
                disabled={share.isPending || unshare.isPending}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    share.mutate({ slug: group.slug, listId });
                  } else if (checked === false) {
                    unshare.mutate({ slug: group.slug, listId });
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
