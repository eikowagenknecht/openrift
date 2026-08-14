import { LinkIcon, Trash2Icon } from "lucide-react";

import { ShareLinkRow } from "@/components/share/share-link-row";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSetTierListShare } from "@/hooks/use-tier-lists";
import { getSiteUrl } from "@/lib/site-config";

interface TierListShareDialogProps {
  tierListId: string;
  isPublic: boolean;
  shareToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Creates and revokes a tier list's public link. Sharing is opt-in — an
 * unshared list has no token at all, so there is no URL to guess.
 *
 * @returns The share dialog node.
 */
export function TierListShareDialog({
  tierListId,
  isPublic,
  shareToken,
  open,
  onOpenChange,
}: TierListShareDialogProps) {
  const setShare = useSetTierListShare();

  const sharing = isPublic && shareToken !== null;
  const shareUrl = shareToken ? `${getSiteUrl()}/tier-lists/share/${shareToken}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share tier list</DialogTitle>
          <DialogDescription>
            {sharing
              ? "Anyone with this link can see the ranking without signing in. They can open any card for its full details."
              : "Create a link to share this ranking. Anyone with the link can see it without signing in."}
          </DialogDescription>
        </DialogHeader>

        {sharing && shareUrl ? <ShareLinkRow url={shareUrl} label="Tier list share link" /> : null}

        {sharing ? (
          <p className="text-muted-foreground text-sm">
            Pasting this link into a video description, Discord, or WhatsApp shows a preview image
            of the board. To save that image, use Download image.
          </p>
        ) : null}

        <DialogFooter>
          {sharing ? (
            <Button
              variant="destructive"
              onClick={() => setShare.mutate({ id: tierListId, shared: false })}
              disabled={setShare.isPending}
            >
              <Trash2Icon />
              Stop sharing
            </Button>
          ) : (
            <Button
              onClick={() => setShare.mutate({ id: tierListId, shared: true })}
              disabled={setShare.isPending}
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
