import type { DeckDetailResponse } from "@openrift/shared/types/api/deck";
import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BoxIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  GitCompareArrowsIcon,
  ImageIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  Share2Icon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarIconButton,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DeckUndoControls } from "@/features/decks/components/deck-undo-controls";
import { LocalDeckBadge } from "@/features/decks/components/local-save-hint";
import type { DeckEditorDialog } from "@/features/decks/hooks/use-deck-editor-dialogs";
import {
  useEncodeDeckCards,
  useExportDeck,
  useUpdateDeck,
  useUpdateDeckMeta,
} from "@/features/decks/hooks/use-decks";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { toEncodeDeckCards } from "@/features/decks/lib/deck-encode-input";
import { ZONE_LABELS } from "@/features/decks/lib/deck-zone-labels";
import { useDeckFormatList } from "@/hooks/use-enums";
import { cn } from "@/lib/utils";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

interface DeckEditorTopBarProps {
  deckId: string;
  deck: DeckDetailResponse["deck"];
  cards: DeckBuilderCard[];
  isLocal: boolean;
  activeZone: DeckZone | null;
  zoneCount: number;
  requiredProgress: { progress: number; total: number };
  hasViolations: boolean;
  onToggleSidebar: () => void;
  openDialog: (dialog: DeckEditorDialog) => void;
}

export function DeckEditorTopBar({
  deckId,
  deck,
  cards,
  isLocal,
  activeZone,
  zoneCount,
  requiredProgress,
  hasViolations,
  onToggleSidebar,
  openDialog,
}: DeckEditorTopBarProps) {
  const navigate = useNavigate();
  const openQuickAdd = useCommandPaletteStore((state) => state.openQuickAdd);
  const { update: updateDeckMeta } = useUpdateDeckMeta(deckId);
  const updateDeck = useUpdateDeck();
  const exportDeck = useExportDeck();
  const encodeDeck = useEncodeDeckCards();
  const { formats } = useDeckFormatList();
  const otherFormats = formats.filter((entry) => entry.slug !== deck.format);

  const handleFormatChange = (slug: string) => {
    updateDeckMeta({ format: slug });
  };

  const handlePlayOnRiftAtlas = () => {
    // Open the placeholder tab synchronously so it survives the popup blocker
    // while we fetch the piltover deck code; navigate it once the code arrives.
    const playTab = window.open("about:blank", "_blank");
    if (!playTab) {
      return;
    }
    playTab.opener = null;
    const onSuccess = ({ code }: { code: string }) => {
      playTab.location.href = `https://play.riftatlas.com/?deckCode=${encodeURIComponent(code)}`;
    };
    const onError = () => playTab.close();
    // A local deck has no server row to export by id — encode its cards via the
    // public endpoint instead.
    if (isLocal) {
      encodeDeck.mutate(
        { format: "piltover", cards: toEncodeDeckCards(cards) },
        { onSuccess, onError },
      );
      return;
    }
    exportDeck.mutate({ deckId, format: "piltover" }, { onSuccess, onError });
  };

  // While a zone browser fills the main area (the hero out of sight), the top
  // bar carries the completion figure shared with the hero and sidebar header.
  const inZoneView = activeZone !== null;

  return (
    <PageTopBar>
      <div className="hidden md:block">
        <PageTopBarBack to="/decks" />
      </div>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <PageTopBarTitle onToggleSidebar={onToggleSidebar}>
          <span className="md:hidden">
            {activeZone ? (
              <>
                {ZONE_LABELS[activeZone]}
                <span className="text-muted-foreground ml-1">({zoneCount})</span>
              </>
            ) : (
              "Zones"
            )}
          </span>
          <span className="hidden md:inline">{deck.name}</span>
        </PageTopBarTitle>
        {/* In editing mode the hero scrolls out of reach, so the bar
            carries the shared completion figure as a compact chip. */}
        {inZoneView && deck.format !== WellKnown.deckFormat.FREEFORM && (
          <span
            className={cn(
              "hidden shrink-0 text-xs tabular-nums md:inline",
              hasViolations
                ? "text-destructive"
                : requiredProgress.progress === requiredProgress.total
                  ? "text-success"
                  : "text-muted-foreground",
            )}
          >
            {requiredProgress.progress}/{requiredProgress.total}
          </span>
        )}
        {isLocal && <LocalDeckBadge className="hidden shrink-0 sm:inline-flex" />}
      </div>
      <PageTopBarActions>
        {/* No tooltip on the phone icon: no hover to open one and no
              Ctrl+K to advertise. */}
        <PageTopBarIconButton
          className="md:hidden"
          aria-label="Add a card"
          onClick={() => openQuickAdd("add")}
        >
          <PlusIcon className="size-4" />
        </PageTopBarIconButton>
        <Tooltip>
          <TooltipTrigger
            render={
              <PageTopBarButton
                className="hidden md:inline-flex"
                aria-keyshortcuts="Control+K"
                onClick={() => openQuickAdd("add")}
              />
            }
          >
            <PlusIcon className="size-4" />
            Add card
          </TooltipTrigger>
          <TooltipContent>Add a card (Ctrl+K)</TooltipContent>
        </Tooltip>
        <DeckUndoControls deckId={deckId} />
        <div className="hidden md:flex md:items-center md:gap-1">
          <PageTopBarButton onClick={() => openDialog("share")}>
            <Share2Icon className="size-4" />
            Share
          </PageTopBarButton>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<PageTopBarIconButton />}>
            <EllipsisVerticalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Share has its own button in the bar from md up, so the
                  entry here is the phone's only way to it. */}
            <div className="md:hidden">
              <DropdownMenuItem onClick={() => openDialog("share")}>
                <Share2Icon className="size-4" />
                Share…
              </DropdownMenuItem>
            </div>
            <DropdownMenuItem onClick={() => openDialog("export")}>
              <DownloadIcon className="size-4" />
              Export…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openDialog("print")}>
              <PrinterIcon className="size-4" />
              Print…
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void navigate({
                  to: "/decks/import",
                  search: { replaceDeckId: deckId },
                })
              }
            >
              <UploadIcon className="size-4" />
              Import &amp; replace cards…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Descriptions are a signed-in feature, so a local deck
                  gets the name on its own. */}
            <DropdownMenuItem onClick={() => openDialog(isLocal ? "rename" : "details")}>
              <PencilIcon className="size-4" />
              {isLocal ? "Rename" : "Name & description"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openDialog("cover")}>
              <ImageIcon className="size-4" />
              Change cover art
            </DropdownMenuItem>
            {/* A home collection points at a server collection, which
                  a browser-local deck can't reference. */}
            {!isLocal && (
              <DropdownMenuItem onClick={() => openDialog("homeCollection")}>
                <BoxIcon className="size-4" />
                Stored in…
              </DropdownMenuItem>
            )}
            {/* Opens the comparison page with this deck pinned as the
                  left side and the other still to pick. */}
            <DropdownMenuItem
              render={<Link to="/decks/compare" search={{ from: deckId, to: undefined }} />}
            >
              <GitCompareArrowsIcon className="size-4" />
              Compare with another deck…
            </DropdownMenuItem>
            {/* Variants are server decks in a family, which a
                  browser-local deck can't join until it's claimed. */}
            {!isLocal && (
              <DropdownMenuItem onClick={() => openDialog("variantCreate")}>
                <CopyIcon className="size-4" />
                New variant…
              </DropdownMenuItem>
            )}
            {/* Always available for a server deck: the dialog is also
                  where a standalone deck gets linked to its first sibling. */}
            {!isLocal && (
              <DropdownMenuItem onClick={() => openDialog("variants")}>
                <GitBranchIcon className="size-4" />
                Variants…
              </DropdownMenuItem>
            )}
            {!isLocal && (
              <DropdownMenuItem
                onClick={() => updateDeck.mutate({ deckId, isDraft: !deck.isDraft })}
              >
                <FlaskConicalIcon className="size-4" />
                {deck.isDraft ? "Remove draft mark" : "Mark as draft"}
              </DropdownMenuItem>
            )}
            {otherFormats.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <RefreshCwIcon className="size-4" />
                  Change format
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {otherFormats.map((entry) => (
                    <DropdownMenuItem
                      key={entry.slug}
                      onClick={() => handleFormatChange(entry.slug)}
                    >
                      {entry.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem onClick={handlePlayOnRiftAtlas}>
              <PlayIcon className="size-4" />
              Play on RiftAtlas
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* A variant is a deck of its own, so this is also how a
                  single version of a family is deleted. */}
            <DropdownMenuItem
              onClick={() => openDialog("delete")}
              className="text-destructive focus:text-destructive"
            >
              <Trash2Icon className="size-4" />
              Delete deck
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageTopBarActions>
    </PageTopBar>
  );
}
