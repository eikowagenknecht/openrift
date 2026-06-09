import {
  CheckIcon,
  CopyIcon,
  ImageDownIcon,
  LinkIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { bundleShareImageUrl, downloadImageFromUrl } from "@/lib/share-image";
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
  const [downloadingImage, setDownloadingImage] = useState(false);

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

  const handleDownloadImage = async () => {
    if (!shareToken) {
      return;
    }
    setDownloadingImage(true);
    // React Compiler can't yet lower try/finally; reset in both paths instead.
    try {
      // A bundle has no single updatedAt here, so cache-bust per download to
      // always fetch the current image.
      const url = bundleShareImageUrl(getSiteUrl(), shareToken, Date.now());
      await downloadImageFromUrl(url, "openrift-lists.png");
      setDownloadingImage(false);
    } catch {
      toast.error("Couldn't prepare the image. Please try again.");
      setDownloadingImage(false);
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

        {sharing && shareUrl ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div>
              <h3 className="font-medium">Post to a chat</h3>
              <p className="text-muted-foreground text-sm">
                Share a card image of all your lists in WhatsApp, Discord, or any group chat.
              </p>
            </div>
            <Button
              variant="outline"
              className="self-start"
              onClick={handleDownloadImage}
              disabled={downloadingImage}
            >
              <ImageDownIcon />
              {downloadingImage ? "Preparing…" : "Download image"}
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
