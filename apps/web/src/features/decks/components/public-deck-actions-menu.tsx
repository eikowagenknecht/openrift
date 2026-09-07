import type { PublicDeckCardResponse } from "@openrift/shared/types/api/deck";
import {
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  ImageDownIcon,
  PrinterIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageTopBarIconButton } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeckExportDialog } from "@/features/decks/components/deck-export-dialog";
import { DeckPrintDialog } from "@/features/decks/components/deck-print-dialog";
import { useEncodeDeckCards } from "@/features/decks/hooks/use-decks";
import { toBuilderCardFromPublic } from "@/features/decks/lib/deck-builder-card";
import { toEncodeDeckCards } from "@/features/decks/lib/deck-encode-input";
import type { PublicDeckSource } from "@/features/decks/lib/public-deck-source";
import { ShareDialog } from "@/features/groups/components/share-dialog";
import type { ShareImageRenderChoice } from "@/features/groups/components/share-image-panel";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { deckShareImageUrl, shareImageVersion } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";

/** Module scope so the copy handler's `try` stays branch-free (React Compiler). */
function reportEncodeWarnings(warnings: readonly string[]): void {
  if (warnings.length > 0) {
    toast.warning("The deck code left some cards out.", { description: warnings.join(" ") });
  }
}

/** Module scope for the same reason as {@link reportEncodeWarnings}. */
function reportCopyResult(written: boolean): void {
  if (written) {
    toast.success("Deck code copied");
    return;
  }
  toast.error("Couldn't copy the deck code");
}

function sizeFor(choice: ShareImageRenderChoice): "hq" | undefined {
  return choice.scale >= 2 ? "hq" : undefined;
}

interface PublicDeckActionsMenuProps {
  deckId: string;
  deckName: string;
  shareToken: string;
  updatedAt: string;
  cards: PublicDeckCardResponse[];
  inTopBar?: boolean;
}

/**
 * Overflow menu on the two read-only deck pages, carrying only the actions
 * that need neither an account nor a session.
 */
export function PublicDeckActionsMenu({
  deckId,
  deckName,
  shareToken,
  updatedAt,
  cards,
  inTopBar = false,
}: PublicDeckActionsMenuProps) {
  const [imageOpen, setImageOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const encodeMutation = useEncodeDeckCards();
  const { copy } = useCopyToClipboard();

  const builderCards = cards.map((card) => toBuilderCardFromPublic(card));
  const publicSource: PublicDeckSource = {
    shareToken,
    imageVersion: shareImageVersion(updatedAt),
  };

  const encodeCards = toEncodeDeckCards(builderCards);
  // The menu closes on click, so the hook's inline "Copied" state never
  // shows; this toast is the only feedback the click gets.
  const handleCopyCode = async () => {
    try {
      const encoded = await encodeMutation.mutateAsync({ cards: encodeCards });
      const written = await copy(encoded.code);
      reportCopyResult(written);
      reportEncodeWarnings(encoded.warnings);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            inTopBar ? (
              <PageTopBarIconButton aria-label="Deck actions" />
            ) : (
              <Button variant="ghost" size="icon" aria-label="Deck actions" />
            )
          }
        >
          <EllipsisVerticalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => void handleCopyCode()}
            disabled={encodeMutation.isPending}
          >
            <CopyIcon className="size-4" />
            Copy deck code
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setImageOpen(true)}>
            <ImageDownIcon className="size-4" />
            Save image…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPrintOpen(true)}>
            <PrinterIcon className="size-4" />
            Print…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setExportOpen(true)}>
            <DownloadIcon className="size-4" />
            Export…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareDialog
        open={imageOpen}
        onOpenChange={setImageOpen}
        title="Save deck image"
        description="Save an image of this deck to post in WhatsApp, Discord, or anywhere else."
        image={{
          title: deckName,
          filenameBase: deckName || "deck",
          buildUrl: (choice) =>
            deckShareImageUrl(getSiteUrl(), shareToken, publicSource.imageVersion, {
              size: sizeFor(choice),
              aspect: choice.aspect,
              qr: choice.qr,
            }),
          scales: [1, 2],
          qr: "available",
          qrLabel: "Include a QR code to the deck",
        }}
      />

      <DeckPrintDialog
        deckId={deckId}
        deckName={deckName}
        cards={builderCards}
        publicSource={publicSource}
        open={printOpen}
        onOpenChange={setPrintOpen}
      />

      <DeckExportDialog
        deckId={deckId}
        isDirty={false}
        cards={builderCards}
        publicSource={publicSource}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </>
  );
}
