import type {
  Currency,
  ListEntryDetailResponse,
  ListKind,
  TradePreference,
} from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, ImageDownIcon, LinkIcon, Trash2Icon } from "lucide-react";
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
  /** Switches to the group-visibility dialog so the two surfaces cross-reference. */
  onManageGroups: () => void;
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
  onManageGroups,
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
    // Only CardTrader-priced lists need the (lazily fetched) price payload;
    // fixed prices resolve from the entry/list data, others show no price.
    // Hoisted out of the try below: React Compiler can't yet lower a logical
    // expression inside try/catch, and this pure check can't throw anyway.
    const usesCardTrader =
      tradeDefaults.pricePref === "ct_zero" ||
      entries.some((entry) => entry.tradeOverride.pricePref === "ct_zero");
    try {
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
    // Owner-authenticated route, so the download works whether or not the list
    // is shared (the public/og image needs a share token). Computed before the
    // try: React Compiler can't yet lower a logical expression inside try/catch,
    // and these pure values can't throw.
    const url = listOwnerImageUrl(getSiteUrl(), listId, shareImageVersion(updatedAt));
    const safeName = listName.replaceAll(/[^\w -]+/gu, "_").trim() || "list";
    // React Compiler can't yet lower try/finally; reset in both paths instead.
    try {
      await downloadImageFromUrl(url, `${safeName}.png`);
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

        <p className="text-muted-foreground border-t pt-4 text-sm">
          Prefer to keep it inside your circle? Set which of your groups can see it in{" "}
          <Button variant="link" className="h-auto p-0" onClick={onManageGroups}>
            Group visibility
          </Button>
          .
        </p>

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
