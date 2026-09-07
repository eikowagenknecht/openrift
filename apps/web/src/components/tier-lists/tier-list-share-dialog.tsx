import { ShareDialog } from "@/components/share/share-dialog";
import { useSetTierListShare } from "@/hooks/use-tier-lists";
import { tierListOwnerImageUrl } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";

const SCALES = [1, 2, 3];

interface TierListShareDialogProps {
  tierListId: string;
  title: string;
  isPublic: boolean;
  shareToken: string | null;
  dirty?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TierListShareDialog({
  tierListId,
  title,
  isPublic,
  shareToken,
  dirty,
  open,
  onOpenChange,
}: TierListShareDialogProps) {
  const setShare = useSetTierListShare();

  const sharing = isPublic && shareToken !== null;
  const shareUrl = shareToken ? `${getSiteUrl()}/tier-lists/share/${shareToken}` : null;

  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share tier list"
      description={
        sharing
          ? "Anyone with this link can see the ranking without signing in. They can open any card for its full details."
          : "Create a link to share this ranking. Anyone with the link can see it without signing in."
      }
      link={{
        url: shareUrl,
        label: "Tier list share link",
        onCreate: () => setShare.mutate({ id: tierListId, shared: true }),
        creating: setShare.isPending,
        onStop: () => setShare.mutate({ id: tierListId, shared: false }),
        stopping: setShare.isPending,
      }}
      image={{
        title,
        filenameBase: title || "tier-list",
        buildUrl: (choice) =>
          tierListOwnerImageUrl(getSiteUrl(), tierListId, {
            aspect: choice.aspect,
            scale: choice.scale,
            qr: choice.qr,
          }),
        scales: SCALES,
        qr: sharing ? "available" : "requires-share",
        qrLabel: "Include a QR code to the tier list",
        note: dirty ? (
          <p className="text-muted-foreground text-sm">
            The image is drawn from the saved board, so save first to see your latest changes in it.
          </p>
        ) : null,
      }}
    >
      {sharing ? (
        <p className="text-muted-foreground text-sm">
          Pasting this link into a video description, Discord, or WhatsApp shows a preview image of
          the board.
        </p>
      ) : null}
    </ShareDialog>
  );
}
