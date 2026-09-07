import { ImageDownIcon, LinkIcon, PrinterIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { BinderSheetDialog } from "@/features/groups/components/binder-sheet-dialog";
import { ShareImagePanel } from "@/features/groups/components/share-image-panel";
import { ShareLinkRow } from "@/features/groups/components/share-link-row";
import {
  useDisableUserShare,
  useEnableUserShare,
  useRotateUserShare,
  useUserShareState,
} from "@/features/groups/hooks/use-user-share";
import { useSession } from "@/lib/auth-session";
import { bundleShareImageUrl } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";

export function PublicSharingSection() {
  const { data, isPending } = useUserShareState();
  const { data: session } = useSession();
  const enableShare = useEnableUserShare();
  const disableShare = useDisableUserShare();
  const rotateShare = useRotateUserShare();
  const [imageOpen, setImageOpen] = useState(false);
  // Stamped only when the dialog opens; stamping it in the URL builder would
  // give the preview a new URL on every render and reload the image forever.
  const [imageVersion, setImageVersion] = useState(0);
  const [binderSheetOpen, setBinderSheetOpen] = useState(false);
  const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);

  const shareToken = data?.shareToken ?? null;
  const shareUrl = shareToken ? `${getSiteUrl()}/users/share/${shareToken}` : null;

  const openImageDialog = () => {
    setImageVersion(Date.now());
    setImageOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public sharing</CardTitle>
        <CardDescription>
          One link to all your wishlists and tradelists, current and future. Organize lists stay
          private.
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
                  A card image of your lists for WhatsApp, Discord, or any chat.
                </p>
              </div>
              <Button variant="outline" className="self-start" onClick={openImageDialog}>
                <ImageDownIcon />
                Download image…
              </Button>
            </div>

            <div className="flex flex-col gap-2 border-t pt-4">
              <div>
                <h3 className="font-medium">Print for your binder</h3>
                <p className="text-muted-foreground text-sm">
                  A card-sized QR sheet trade partners can scan from your binder.
                </p>
              </div>
              <Button
                variant="outline"
                className="self-start"
                onClick={() => setBinderSheetOpen(true)}
              >
                <PrinterIcon />
                Print binder sheet
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

      {shareToken ? (
        <Dialog open={imageOpen} onOpenChange={setImageOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Download image</DialogTitle>
              <DialogDescription>
                A card image of your wishlists and tradelists, sized for a chat or a story.
              </DialogDescription>
            </DialogHeader>
            <ShareImagePanel
              title="your shared lists"
              filenameBase="openrift-lists"
              buildUrl={(choice) =>
                bundleShareImageUrl(getSiteUrl(), shareToken, imageVersion, {
                  size: choice.scale >= 2 ? "hq" : undefined,
                  aspect: choice.aspect,
                  qr: choice.qr,
                })
              }
              scales={[1, 2]}
              qr="available"
              qrLabel="Include a QR code to your lists"
            />
          </DialogContent>
        </Dialog>
      ) : null}

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
