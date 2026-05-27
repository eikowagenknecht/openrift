import { CheckIcon, CopyIcon, LinkIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDisableUserShare,
  useEnableUserShare,
  useRotateUserShare,
  useUserShareState,
} from "@/hooks/use-user-share";
import { getSiteUrl } from "@/lib/site-config";

interface UserShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Manage the one-link-for-all-lists bundle (ADR-018). Enabled state shows
 * the URL + copy + rotate + revoke; disabled state offers a single "Create
 * link" CTA. Fetches its own state via `useUserShareState` so callers don't
 * need to thread a token in.
 *
 * @returns The dialog node.
 */
export function UserShareDialog({ open, onOpenChange }: UserShareDialogProps) {
  const { data, isPending } = useUserShareState();
  const enableShare = useEnableUserShare();
  const disableShare = useDisableUserShare();
  const rotateShare = useRotateUserShare();
  const [justCopied, setJustCopied] = useState(false);

  const shareToken = data?.shareToken ?? null;
  const shareUrl = shareToken ? `${getSiteUrl()}/users/share/${shareToken}` : null;
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
          <DialogTitle>Share all your lists</DialogTitle>
          <DialogDescription>
            {sharing
              ? "Anyone with this link can view every wishlist and tradelist you have. Organize lists stay private."
              : "Create one link that shows all your wishlists and tradelists. New lists you create will appear automatically."}
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : sharing && shareUrl ? (
          <div className="flex items-center gap-2">
            <Input value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
            <Button variant="outline" onClick={handleCopy}>
              {justCopied ? <CheckIcon /> : <CopyIcon />}
              {justCopied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : null}

        {!isPending && (
          <DialogFooter className="gap-2">
            {sharing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => rotateShare.mutate()}
                  disabled={rotateShare.isPending}
                >
                  <RefreshCwIcon />
                  Reset link
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => disableShare.mutate()}
                  disabled={disableShare.isPending}
                >
                  <Trash2Icon />
                  Stop sharing
                </Button>
              </>
            ) : (
              <Button onClick={() => enableShare.mutate()} disabled={enableShare.isPending}>
                <LinkIcon />
                Create link
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
