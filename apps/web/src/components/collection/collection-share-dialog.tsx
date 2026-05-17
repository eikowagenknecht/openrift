import { CheckIcon, CopyIcon, LinkIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useShareCollection, useUnshareCollection } from "@/hooks/use-collections";
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
            <Button
              onClick={() => shareCollection.mutate(collectionId)}
              disabled={shareCollection.isPending}
            >
              <LinkIcon />
              Create link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
