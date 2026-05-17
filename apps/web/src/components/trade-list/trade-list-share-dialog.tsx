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
import { useShareTradeList, useUnshareTradeList } from "@/hooks/use-trade-lists";
import { getSiteUrl } from "@/lib/site-config";

interface TradeListShareDialogProps {
  tradeListId: string;
  shareToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TradeListShareDialog({
  tradeListId,
  shareToken,
  open,
  onOpenChange,
}: TradeListShareDialogProps) {
  const shareTradeList = useShareTradeList();
  const unshareTradeList = useUnshareTradeList();
  const [justCopied, setJustCopied] = useState(false);

  const shareUrl = shareToken ? `${getSiteUrl()}/trade-lists/share/${shareToken}` : null;
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
          <DialogTitle>Share trade list</DialogTitle>
          <DialogDescription>
            {sharing
              ? "Anyone with this link can view the cards on this trade list."
              : "Create a link to share this trade list. Anyone with the link will be able to view it without signing in."}
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
              onClick={() => unshareTradeList.mutate(tradeListId)}
              disabled={unshareTradeList.isPending}
            >
              <Trash2Icon />
              Stop sharing
            </Button>
          ) : (
            <Button
              onClick={() => shareTradeList.mutate(tradeListId)}
              disabled={shareTradeList.isPending}
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
