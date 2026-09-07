import type {
  ListEntryDetailResponse,
  ListIntent,
  ListKind,
} from "@openrift/shared/types/api/list";
import type { Currency, TradePreference } from "@openrift/shared/types/api/trade-preferences";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { CopyTextButton } from "@/components/share/copy-text-button";
import { ShareDialog } from "@/components/share/share-dialog";
import { Button } from "@/components/ui/button";
import { useEnumOrders } from "@/hooks/use-enums";
import { useShareList, useUnshareList } from "@/hooks/use-lists";
import { ensurePriceLookup } from "@/hooks/use-prices";
import { formatListShareText } from "@/lib/list-export";
import { listOwnerImageUrl, shareImageVersion } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";

interface ListShareDialogProps {
  listId: string;
  listName: string;
  kind: ListKind;
  intent: ListIntent;
  tradeDefaults: TradePreference;
  currency: Currency | null;
  shareToken: string | null;
  updatedAt: string;
  entries: readonly ListEntryDetailResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManageGroups: () => void;
}

export function ListShareDialog({
  listId,
  listName,
  kind,
  intent,
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
  const { labels } = useEnumOrders();

  const shareUrl = shareToken ? `${getSiteUrl()}/lists/share/${shareToken}` : null;
  const sharing = shareToken !== null;

  const buildShareText = async (): Promise<string> => {
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
    return formatListShareText(listName, kind, entries, shareUrl, labels.finishes, {
      tradeDefaults,
      currency,
      ctPriceFor,
    });
  };

  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share list"
      description={
        sharing
          ? "Anyone with this link can view the cards on this list."
          : "Create a link to share this list. Anyone with the link will be able to view it without signing in."
      }
      link={{
        url: shareUrl,
        label: "List share link",
        onCreate: () => shareList.mutate(listId),
        creating: shareList.isPending,
        onStop: () => unshareList.mutate(listId),
        stopping: unshareList.isPending,
      }}
      image={{
        title: listName,
        filenameBase: listName || "list",
        // Owner-authenticated route, so the render works whether or not the
        // list is shared (the public/og image needs a share token).
        buildUrl: (choice) =>
          listOwnerImageUrl(getSiteUrl(), listId, shareImageVersion(updatedAt), {
            size: choice.scale >= 2 ? "hq" : undefined,
            aspect: choice.aspect,
            qr: choice.qr,
          }),
        scales: [1, 2],
        qr: sharing ? "available" : "requires-share",
        qrLabel: "Include a QR code to the list",
      }}
    >
      <div className="flex flex-col gap-2 border-t pt-4">
        <div>
          <h3 className="font-medium">Post to a chat</h3>
          <p className="text-muted-foreground text-sm">
            Drop the list as text straight into WhatsApp, Discord, or any group chat.
            {sharing ? "" : " The text uses no link until you create one above."}
          </p>
        </div>
        <div className="flex gap-2">
          <CopyTextButton label="Copy text" getText={buildShareText} />
        </div>
      </div>

      {intent === "organize" ? null : (
        <div className="text-muted-foreground flex flex-col gap-1 border-t pt-4 text-sm">
          <p>
            One link covers every wishlist and tradelist you have, under{" "}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => onOpenChange(false)}
              render={<Link to="/profile" hash="sharing" />}
            >
              Public sharing
            </Button>
            .
          </p>
        </div>
      )}
    </ShareDialog>
  );
}
