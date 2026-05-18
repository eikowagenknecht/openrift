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
