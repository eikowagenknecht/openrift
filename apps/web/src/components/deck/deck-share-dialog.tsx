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
import { useShareDeck, useUnshareDeck } from "@/hooks/use-decks";
import { deckShareImageUrl, downloadImageFromUrl, shareImageVersion } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";

interface DeckShareDialogProps {
  deckId: string;
  deckName: string;
  isPublic: boolean;
  shareToken: string | null;
  updatedAt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeckShareDialog({
  deckId,
  deckName,
  isPublic,
  shareToken,
  updatedAt,
  open,
  onOpenChange,
}: DeckShareDialogProps) {
  const shareDeck = useShareDeck();
  const unshareDeck = useUnshareDeck();
  const [justCopied, setJustCopied] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);

  const shareUrl = shareToken ? `${getSiteUrl()}/decks/share/${shareToken}` : null;
  const sharing = isPublic && shareToken !== null;

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

  const handleDownloadImage = async () => {
    if (!shareToken) {
      return;
    }
    setDownloadingImage(true);
    // The public/og image route needs a share token, so the HQ download is only
    // offered while the deck is shared. `size: "hq"` renders the 2× variant.
    // Computed before the try: React Compiler can't yet lower a logical
    // expression inside try/catch, and these pure values can't throw.
    const url = deckShareImageUrl(getSiteUrl(), shareToken, shareImageVersion(updatedAt), "hq");
    const safeName = deckName.replaceAll(/[^\w -]+/gu, "_").trim() || "deck";
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
          <DialogTitle>Share deck</DialogTitle>
          <DialogDescription>
            {sharing
              ? "Anyone with this link can view the deck. They can also copy it into their own decks."
              : "Create a link to share this deck. Anyone with the link will be able to view it without signing in."}
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

        {sharing ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div>
              <h3 className="font-medium">Post to a chat</h3>
              <p className="text-muted-foreground text-sm">
                Download a high-resolution deck image for WhatsApp, Discord, or printing.
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
        ) : null}

        <DialogFooter>
          {sharing ? (
            <Button
              variant="destructive"
              onClick={() => unshareDeck.mutate(deckId)}
              disabled={unshareDeck.isPending}
            >
              <Trash2Icon />
              Stop sharing
            </Button>
          ) : (
            <Button onClick={() => shareDeck.mutate(deckId)} disabled={shareDeck.isPending}>
              <LinkIcon />
              Create link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
