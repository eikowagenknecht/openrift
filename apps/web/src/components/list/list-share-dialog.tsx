import type {
  Currency,
  ListEntryDetailResponse,
  ListKind,
  TradePreference,
} from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, ImageDownIcon, LinkIcon, Trash2Icon } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useFriendGroups,
  useShareListWithFriendGroup,
  useUnshareListFromFriendGroup,
} from "@/hooks/use-friend-groups";
import { useListGroupShares } from "@/hooks/use-list-group-shares";
import { useShareList, useUnshareList } from "@/hooks/use-lists";
import { ensurePriceLookup } from "@/hooks/use-prices";
import { formatListShareText } from "@/lib/list-export";
import { downloadImageFromUrl, listOwnerImageUrl, shareImageVersion } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";

interface ListShareDialogProps {
  listId: string;
  listName: string;
  kind: ListKind;
  tradeDefaults: TradePreference;
  currency: Currency | null;
  shareToken: string | null;
  updatedAt: string;
  entries: readonly ListEntryDetailResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ListShareDialog({
  listId,
  listName,
  kind,
  tradeDefaults,
  currency,
  shareToken,
  updatedAt,
  entries,
  open,
  onOpenChange,
}: ListShareDialogProps) {
  const shareList = useShareList();
  const unshareList = useUnshareList();
  const queryClient = useQueryClient();
  const [justCopied, setJustCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);

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

  const handleCopyText = async () => {
    try {
      // Only CardTrader-priced lists need the (lazily fetched) price payload;
      // fixed prices resolve from the entry/list data, others show no price.
      const usesCardTrader =
        tradeDefaults.pricePref === "ct_zero" ||
        entries.some((entry) => entry.tradeOverride.pricePref === "ct_zero");
      let ctPriceFor: ((printingId: string) => number | undefined) | undefined;
      if (usesCardTrader) {
        try {
          const lookup = await ensurePriceLookup(queryClient);
          ctPriceFor = (printingId) => lookup.get(printingId, "cardtrader");
        } catch {
          // Prices unavailable — fall back to no CardTrader prices.
        }
      }
      // shareUrl is null when the list isn't shared; the text block omits it.
      const text = formatListShareText(listName, kind, entries, shareUrl, {
        tradeDefaults,
        currency,
        ctPriceFor,
      });
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      globalThis.setTimeout(() => setCopiedText(false), 1500);
    } catch {
      // Ignore clipboard errors; the user can still copy the link.
    }
  };

  const handleDownloadImage = async () => {
    setDownloadingImage(true);
    try {
      // Owner-authenticated route, so the download works whether or not the list
      // is shared (the public/og image needs a share token).
      const url = listOwnerImageUrl(getSiteUrl(), listId, shareImageVersion(updatedAt));
      const safeName = listName.replaceAll(/[^\w -]+/gu, "_").trim() || "list";
      await downloadImageFromUrl(url, `${safeName}.png`);
    } catch {
      toast.error("Couldn't prepare the image. Please try again.");
    } finally {
      setDownloadingImage(false);
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

        <div className="flex flex-col gap-2 border-t pt-4">
          <div>
            <h3 className="font-medium">Post to a chat</h3>
            <p className="text-muted-foreground text-sm">
              Drop a card image or a text list straight into WhatsApp, Discord, or any group chat.
              {sharing ? "" : " The text uses no link until you create one above."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopyText}>
              {copiedText ? <CheckIcon /> : <CopyIcon />}
              {copiedText ? "Copied" : "Copy text"}
            </Button>
            <Button variant="outline" onClick={handleDownloadImage} disabled={downloadingImage}>
              <ImageDownIcon />
              {downloadingImage ? "Preparing…" : "Download image"}
            </Button>
          </div>
        </div>

        <Suspense fallback={null}>
          <ListGroupShareSection listId={listId} />
        </Suspense>

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

function ListGroupShareSection({ listId }: { listId: string }) {
  const { data: groups } = useFriendGroups();
  const { data: sharedWith } = useListGroupShares(listId);
  const share = useShareListWithFriendGroup();
  const unshare = useUnshareListFromFriendGroup();

  if (groups.items.length === 0) {
    return null;
  }

  const sharedSet = new Set(sharedWith.items.map((row) => row.groupId));

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="font-medium">Share with friend groups</h3>
        <p className="text-muted-foreground text-sm">
          Members of the selected groups can view this list while signed in.
        </p>
      </div>
      <ul className="space-y-2">
        {groups.items.map((group) => {
          const isShared = sharedSet.has(group.id);
          const checkboxId = `share-list-group-${group.id}`;
          return (
            <li key={group.id} className="flex items-center gap-2">
              <Checkbox
                id={checkboxId}
                checked={isShared}
                disabled={share.isPending || unshare.isPending}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    share.mutate({ slug: group.slug, listId });
                  } else if (checked === false) {
                    unshare.mutate({ slug: group.slug, listId });
                  }
                }}
              />
              <label htmlFor={checkboxId} className="cursor-pointer text-sm">
                {group.name}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
