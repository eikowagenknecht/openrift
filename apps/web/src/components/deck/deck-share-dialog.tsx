import { LinkIcon, Trash2Icon } from "lucide-react";

import { ShareLinkRow } from "@/components/share/share-link-row";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useShareDeck, useUnshareDeck } from "@/hooks/use-decks";
import { getSiteUrl } from "@/lib/site-config";

interface DeckShareDialogProps {
  deckId: string;
  isPublic: boolean;
  shareToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeckShareDialog({
  deckId,
  isPublic,
  shareToken,
  open,
  onOpenChange,
}: DeckShareDialogProps) {
  const shareDeck = useShareDeck();
  const unshareDeck = useUnshareDeck();

  const shareUrl = shareToken ? `${getSiteUrl()}/decks/share/${shareToken}` : null;
  const sharing = isPublic && shareToken !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share deck</DialogTitle>
          <DialogDescription>
            {sharing
              ? "Anyone with this link can view the deck, including your Plan (strategy, mulligans, and matchup notes). They can also copy the deck into their own decks."
              : "Create a link to share this deck. Anyone with the link will be able to view it without signing in, including your Plan (strategy, mulligans, and matchup notes)."}
          </DialogDescription>
        </DialogHeader>

        {sharing && shareUrl ? <ShareLinkRow url={shareUrl} label="Deck share link" /> : null}

        {sharing ? (
          <p className="text-muted-foreground text-sm">
            Pasting this link into WhatsApp, Discord, or Signal shows a preview image of the deck.
            To save that image, open Export and pick the Image tab.
          </p>
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
