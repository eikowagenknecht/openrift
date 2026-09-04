import type { PublicDeckCardResponse } from "@openrift/shared";
import {
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  ImageDownIcon,
  PrinterIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DeckExportDialog } from "@/components/deck/deck-export-dialog";
import { DeckPrintDialog } from "@/components/deck/deck-print-dialog";
import { PageTopBarIconButton } from "@/components/layout/page-top-bar";
import { ShareDialog } from "@/components/share/share-dialog";
import type { ShareImageRenderChoice } from "@/components/share/share-image-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useEncodeDeckCards } from "@/hooks/use-decks";
import { toBuilderCardFromPublic } from "@/lib/deck-builder-card";
import { toEncodeDeckCards } from "@/lib/deck-encode-input";
import type { PublicDeckSource } from "@/lib/public-deck-source";
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
  /** The share token both public deck pages are reached through. */
  shareToken: string;
  /** The deck's `updatedAt`, which cache-busts the rendered image. */
  updatedAt: string;
  cards: PublicDeckCardResponse[];
  /** Renders the trigger as a top-bar icon button, for a page that has a bar. */
  inTopBar?: boolean;
}

/**
 * The overflow menu on the two read-only deck pages, `/decks/share/$token` and
 * the archive's `/meta/decks/$token`. Carries only the actions that need
 * neither an account nor a session.
 *
 * @returns The public deck actions menu.
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

  // The viewer has no server row to export, so the code comes from the public
  // stateless encoder — the same codecs the owner's export runs.
  const encodeCards = toEncodeDeckCards(builderCards);
  // The menu closes on click, so the hook's inline "Copied" never shows;
  // the toast here is the only feedback the click gets.
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
