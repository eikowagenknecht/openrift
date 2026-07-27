import { LinkIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { ShareLinkRow } from "@/components/share/share-link-row";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogForm } from "@/components/ui/dialog-form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDisableUserShare,
  useEnableUserShare,
  useRotateUserShare,
  useUserShareState,
} from "@/hooks/use-user-share";
import { getSiteUrl } from "@/lib/site-config";

/**
 * Profile-page card managing the user share bundle token (ADR-018). Same
 * affordances as `UserShareDialog` but laid out inline as a settings section.
 *
 * @returns The settings card node.
 */
export function PublicSharingSection() {
  const { data, isPending } = useUserShareState();
  const enableShare = useEnableUserShare();
  const disableShare = useDisableUserShare();
  const rotateShare = useRotateUserShare();
  const [resetOpen, setResetOpen] = useState(false);

  const shareToken = data?.shareToken ?? null;
  const shareUrl = shareToken ? `${getSiteUrl()}/users/share/${shareToken}` : null;
  const sharing = shareToken !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public sharing</CardTitle>
        <CardDescription>
          A single link that shows everything you&apos;re looking for and everything you&apos;re
          offering. New wishlists and tradelists are included automatically as you create them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : sharing && shareUrl ? (
          <>
            <ShareLinkRow url={shareUrl} label="Bundle share link" />
            <div className="flex flex-wrap gap-2">
              <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
                <AlertDialogTrigger
                  render={
                    <Button variant="destructive" disabled={rotateShare.isPending}>
                      <RefreshCwIcon />
                      Reset link
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <DialogForm
                    onSubmit={() => {
                      rotateShare.mutate(undefined, {
                        onSuccess: () => setResetOpen(false),
                      });
                    }}
                  >
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset your share link?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The current link will stop working immediately. Anyone you previously shared
                        it with will need the new link to view your lists.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <Button type="submit" variant="destructive" disabled={rotateShare.isPending}>
                        <RefreshCwIcon />
                        Reset link
                      </Button>
                    </AlertDialogFooter>
                  </DialogForm>
                </AlertDialogContent>
              </AlertDialog>
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
    </Card>
  );
}
