import { ImageDownIcon, LinkIcon, PrinterIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { BinderSheetDialog } from "@/components/share/binder-sheet-dialog";
import { ShareLinkRow } from "@/components/share/share-link-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDisableUserShare,
  useEnableUserShare,
  useRotateUserShare,
  useUserShareState,
} from "@/hooks/use-user-share";
import { useSession } from "@/lib/auth-session";
import { bundleShareImageUrl, downloadImageFromUrl } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";

/**
 * Profile-page card managing the user share bundle token (ADR-018): the link
 * itself plus the two ways to hand it out offline, a card image for chats and
 * a printable binder QR sheet. This is the only entry point for the bundle.
 *
 * @returns The settings card node.
 */
export function PublicSharingSection() {
  const { data, isPending } = useUserShareState();
  const { data: session } = useSession();
  const enableShare = useEnableUserShare();
  const disableShare = useDisableUserShare();
  const rotateShare = useRotateUserShare();
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [binderSheetOpen, setBinderSheetOpen] = useState(false);
  const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);

  const shareToken = data?.shareToken ?? null;
  const shareUrl = shareToken ? `${getSiteUrl()}/users/share/${shareToken}` : null;

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
    <Card>
      <CardHeader>
        <CardTitle>Public sharing</CardTitle>
        <CardDescription>
          A single link that shows everything you&apos;re looking for and everything you&apos;re
          offering. New wishlists and tradelists are included automatically as you create them.
          Organize lists stay private.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : shareUrl ? (
          <>
            <ShareLinkRow url={shareUrl} label="Bundle share link" />

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

            <div className="flex flex-col gap-2 border-t pt-4">
              <div>
                <h3 className="font-medium">Print for your binder</h3>
                <p className="text-muted-foreground text-sm">
                  A QR sheet at true card or binder-page size, so trade partners can scan your lists
                  straight out of your binder.
                </p>
              </div>
              <Button
                variant="outline"
                className="self-start"
                onClick={() => setBinderSheetOpen(true)}
              >
                <PrinterIcon />
                Create PDF
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button
                variant="destructive"
                onClick={() => setConfirmRotateOpen(true)}
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
            </div>
          </>
        ) : (
          <Button
            onClick={() => enableShare.mutate()}
            disabled={enableShare.isPending}
            className="self-start"
          >
            <LinkIcon />
            Create link
          </Button>
        )}
      </CardContent>

      {shareUrl ? (
        <BinderSheetDialog
          open={binderSheetOpen}
          onOpenChange={setBinderSheetOpen}
          shareUrl={shareUrl}
          defaultTitle={session?.user?.name ?? "My lists"}
          defaultSubtitle="Scan to see my wish & tradelists"
          filenameHint="my-lists"
        />
      ) : null}

      <ConfirmActionDialog
        open={confirmRotateOpen}
        onOpenChange={setConfirmRotateOpen}
        title="Reset your share link?"
        description="The old link stops working immediately. Anything printed with the old link, like a binder QR sheet, stops working too and needs reprinting."
        confirmLabel="Reset link"
        pendingLabel="Resetting…"
        isPending={rotateShare.isPending}
        onConfirm={() => {
          rotateShare.mutate();
          setConfirmRotateOpen(false);
        }}
      />
    </Card>
  );
}
