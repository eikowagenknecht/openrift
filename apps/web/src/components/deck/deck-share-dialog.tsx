import { useLocalDeckImageBody } from "@/components/deck/local-deck-image-body";
import { ShareDialog } from "@/components/share/share-dialog";
import type { ShareImageRenderChoice } from "@/components/share/share-image-panel";
import { useShareDeck, useUnshareDeck } from "@/hooks/use-decks";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { deckImageFromCardsUrl, deckOwnerImageUrl, downloadImageFromPost } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { isLocalDeckId } from "@/stores/local-decks-store";

interface DeckShareDialogProps {
  deckId: string;
  deckName: string;
  /** Server decks only; a browser-local deck has no share row. */
  isPublic?: boolean;
  shareToken?: string | null;
  /** Warns that the render still shows the last saved state. */
  isDirty?: boolean;
  /**
   * Cards for a browser-local deck's from-cards render. Falls back to the live
   * editor draft, which the deck-list menus don't have hydrated.
   */
  cards?: DeckBuilderCard[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** @returns The image size parameter for a chosen multiplier. */
function sizeFor(choice: ShareImageRenderChoice): "hq" | undefined {
  return choice.scale >= 2 ? "hq" : undefined;
}

/**
 * Share dialog for a saved deck: the public link plus the server-rendered
 * image, which is both the link's unfurl preview and a download.
 * @returns The share dialog element.
 */
function ServerDeckShareDialog({
  deckId,
  deckName,
  isPublic = false,
  shareToken = null,
  isDirty = false,
  open,
  onOpenChange,
}: DeckShareDialogProps) {
  const shareDeck = useShareDeck();
  const unshareDeck = useUnshareDeck();

  const sharing = isPublic && shareToken !== null;
  const shareUrl = shareToken ? `${getSiteUrl()}/decks/share/${shareToken}` : null;

  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share deck"
      description={
        sharing
          ? "Anyone with this link can view the deck, including your Plan (strategy, mulligans, and matchup notes). They can also copy the deck into their own decks."
          : "Create a link to share this deck. Anyone with the link will be able to view it without signing in, including your Plan (strategy, mulligans, and matchup notes)."
      }
      link={{
        url: shareUrl,
        label: "Deck share link",
        onCreate: () => shareDeck.mutate(deckId),
        creating: shareDeck.isPending,
        onStop: () => unshareDeck.mutate(deckId),
        stopping: unshareDeck.isPending,
      }}
      image={{
        title: deckName,
        filenameBase: deckName || "deck",
        buildUrl: (choice) =>
          deckOwnerImageUrl(getSiteUrl(), deckId, {
            size: sizeFor(choice),
            aspect: choice.aspect,
            qr: choice.qr,
          }),
        scales: [1, 2],
        qr: sharing ? "available" : "requires-share",
        qrLabel: "Include a QR code to the deck",
        note: isDirty ? (
          <p className="text-muted-foreground text-sm">
            You have unsaved changes. The image reflects the last saved state.
          </p>
        ) : undefined,
      }}
    >
      {sharing ? (
        <p className="text-muted-foreground text-sm">
          Pasting this link into WhatsApp, Discord, or Signal shows a preview image of the deck.
        </p>
      ) : null}
    </ShareDialog>
  );
}

/**
 * Share dialog for a browser-local deck (ADR-035): no server row, so no link
 * and no QR — only the image, rendered from the cards themselves.
 * @returns The share dialog element.
 */
function LocalDeckShareDialog({
  deckId,
  deckName,
  cards,
  open,
  onOpenChange,
}: DeckShareDialogProps) {
  const imageBody = useLocalDeckImageBody(deckId, deckName, cards);

  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share deck"
      description="Save an image of this deck to post in WhatsApp, Discord, or anywhere else."
      noLinkNote={
        <p className="text-muted-foreground text-sm">
          Save this deck to your account to get a share link.
        </p>
      }
      image={{
        title: deckName,
        filenameBase: deckName || "deck",
        // A local deck has no server row to resolve by id, so the render is
        // posted the cards instead — which means no GET URL, and no preview.
        buildUrl: () => deckImageFromCardsUrl(getSiteUrl()),
        download: (choice, filename) =>
          downloadImageFromPost(
            deckImageFromCardsUrl(getSiteUrl(), {
              size: sizeFor(choice),
              aspect: choice.aspect,
              qr: false,
            }),
            imageBody(),
            filename,
          ),
        scales: [1, 2],
        qr: "hidden",
      }}
    />
  );
}

/**
 * The deck share surface: a link and an image for a saved deck, an image alone
 * for a browser-local one. Split so the local branch never reaches the
 * account-only share mutations.
 * @returns The share dialog element.
 */
export function DeckShareDialog(props: DeckShareDialogProps) {
  if (isLocalDeckId(props.deckId)) {
    return <LocalDeckShareDialog {...props} />;
  }
  return <ServerDeckShareDialog {...props} />;
}
