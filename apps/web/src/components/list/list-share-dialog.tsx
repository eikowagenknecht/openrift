import type {
  Currency,
  ListEntryDetailResponse,
  ListIntent,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  intent: ListIntent;
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
  intent,
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

        <Suspense fallback={null}>
          <ListGroupShareSection listId={listId} intent={intent} />
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

type GroupVisibilityMode = "all" | "selected" | "none";

const VISIBILITY_OPTIONS: { value: GroupVisibilityMode; label: string }[] = [
  { value: "all", label: "All my groups" },
  { value: "selected", label: "Some groups" },
  { value: "none", label: "Only me" },
];

/**
 * Group-visibility control for the share dialog. Sharing is opt-in (ADR-013):
 * a list is private until the owner shares it. This derives the current mode
 * from the share rows and lets the user switch to "all", a per-group selection,
 * or fully private in one click.
 * @returns The section, or `null` when the user has no groups.
 */
function ListGroupShareSection({ listId, intent }: { listId: string; intent: ListIntent }) {
  const { data: groups } = useFriendGroups();
  const { data: sharedWith } = useListGroupShares(listId);
  const share = useShareListWithFriendGroup();
  const unshare = useUnshareListFromFriendGroup();
  // Sticky while interacting: picking "Some groups" must not bounce back to a
  // derived "all"/"none" when the checkboxes momentarily match those states.
  const [modeOverride, setModeOverride] = useState<GroupVisibilityMode | null>(null);

  if (groups.items.length === 0) {
    return null;
  }

  const sharedSet = new Set(sharedWith.items.map((row) => row.groupId));
  const derivedMode: GroupVisibilityMode =
    sharedSet.size === 0 ? "none" : sharedSet.size >= groups.items.length ? "all" : "selected";
  const mode = modeOverride ?? derivedMode;
  const pending = share.isPending || unshare.isPending;

  const applyMode = (next: GroupVisibilityMode) => {
    setModeOverride(next);
    if (next === "all") {
      for (const group of groups.items) {
        if (!sharedSet.has(group.id)) {
          share.mutate({ slug: group.slug, listId });
        }
      }
    } else if (next === "none") {
      for (const group of groups.items) {
        if (sharedSet.has(group.id)) {
          unshare.mutate({ slug: group.slug, listId });
        }
      }
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="font-medium">Group visibility</h3>
        <p className="text-muted-foreground text-sm">
          {intent === "organize"
            ? "Members of the selected groups can view this list while signed in."
            : "Members of the groups you choose can view this list and find trades with you."}
        </p>
      </div>
      <RadioGroup
        value={mode}
        onValueChange={(next) => applyMode(next as GroupVisibilityMode)}
        className="flex flex-col gap-2"
      >
        {VISIBILITY_OPTIONS.map((option) => {
          const radioId = `list-group-visibility-${option.value}`;
          return (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem id={radioId} value={option.value} disabled={pending} />
              <label htmlFor={radioId} className="cursor-pointer text-sm">
                {option.label}
              </label>
            </div>
          );
        })}
      </RadioGroup>
      {mode === "selected" ? (
        <ul className="space-y-2 border-s ps-4">
          {groups.items.map((group) => {
            const isShared = sharedSet.has(group.id);
            const checkboxId = `share-list-group-${group.id}`;
            return (
              <li key={group.id} className="flex items-center gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={isShared}
                  disabled={pending}
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
      ) : null}
    </div>
  );
}
