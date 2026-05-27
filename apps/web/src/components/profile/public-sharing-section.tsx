import { CheckIcon, CopyIcon, LinkIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    <Card>
      <CardHeader>
        <CardTitle>Public sharing</CardTitle>
        <CardDescription>
          One link covering every wishlist and tradelist you have. New lists join automatically.
          Organize lists are never included.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : sharing && shareUrl ? (
          <>
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
              <Button variant="outline" onClick={handleCopy}>
                {justCopied ? <CheckIcon /> : <CopyIcon />}
                {justCopied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
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
