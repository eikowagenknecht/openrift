import { Link } from "@tanstack/react-router";
import {
  BoxIcon,
  CameraIcon,
  EllipsisVerticalIcon,
  LayersIcon,
  PencilIcon,
  PrinterIcon,
  Share2Icon,
  SquarePlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

import { SelectModeActions } from "@/components/cards/select-mode-actions";
import { CollectionValueSummary } from "@/components/collection/collection-value-summary";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarIconButton,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { BinderSheetDialog } from "@/components/share/binder-sheet-dialog";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deckBoxLabel } from "@/lib/deck-box-label";

interface CollectionTopBarProps {
  title: string;
  homeDecks: { id: string; name: string }[];
  onToggleSidebar: () => void;
  mode: "browse" | "select";
  valueCents: number | null | undefined;
  unpricedCount: number | null | undefined;
  formatValue: (value: number) => string;
  addTarget?: string;
  addActionsInBar: boolean;
  showAddActions: boolean;
  onQuickAdd: () => void;
  onSelectAll: () => void;
  onEnterSelect: () => void;
  onExitSelect: () => void;
  hasCards: boolean;
  isAllSelected: boolean;
  view: string;
  canEdit: boolean;
  canDelete: boolean;
  canClearInbox: boolean;
  canShare: boolean;
  canToggleDeckbuilding: boolean;
  deckbuildingAvailable: boolean;
  shareUrl?: string;
  collectionName?: string;
  onEdit: () => void;
  onDelete: () => void;
  onClearInbox: () => void;
  onShare: () => void;
  onToggleDeckbuilding: () => void;
}

export function CollectionTopBar({
  title,
  homeDecks,
  onToggleSidebar,
  mode,
  valueCents,
  unpricedCount,
  formatValue,
  addTarget,
  addActionsInBar,
  showAddActions,
  onQuickAdd,
  onSelectAll,
  onEnterSelect,
  onExitSelect,
  hasCards,
  isAllSelected,
  view,
  canEdit,
  canDelete,
  canClearInbox,
  canShare,
  canToggleDeckbuilding,
  deckbuildingAvailable,
  shareUrl,
  collectionName,
  onEdit,
  onDelete,
  onClearInbox,
  onShare,
  onToggleDeckbuilding,
}: CollectionTopBarProps) {
  const [binderSheetOpen, setBinderSheetOpen] = useState(false);

  const canAdd = Boolean(addTarget) && mode === "browse" && showAddActions;
  const showAddMenuItems = canAdd && !addActionsInBar;
  const canPrintBinder = canShare && shareUrl !== undefined;
  const shareInBar = canShare && mode === "browse" && !addActionsInBar;
  const boxLabel = deckBoxLabel(homeDecks);
  const singleHomeDeck = homeDecks.length === 1 ? homeDecks[0] : undefined;

  return (
    <>
      <PageTopBar>
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <PageTopBarTitle onToggleSidebar={onToggleSidebar}>{title}</PageTopBarTitle>

          {boxLabel && (
            <Badge variant="muted" className="shrink-0 gap-1 self-center">
              <BoxIcon className="size-3" />
              {singleHomeDeck ? (
                <Link
                  to="/decks/$deckId"
                  params={{ deckId: singleHomeDeck.id }}
                  className="max-w-32 truncate underline-offset-2 hover:underline"
                >
                  {boxLabel}
                </Link>
              ) : (
                <span className="max-w-32 truncate">{boxLabel}</span>
              )}
            </Badge>
          )}

          <CollectionValueSummary
            valueCents={valueCents}
            unpricedCount={unpricedCount}
            formatValue={formatValue}
          />
        </div>

        <PageTopBarActions>
          <div className="flex items-center gap-2">
            {addActionsInBar && canAdd && (
              <>
                <PageTopBarIconButton
                  render={<Link to="/scan" />}
                  aria-label="Scan cards"
                  className="sm:hidden"
                >
                  <CameraIcon className="size-4" />
                </PageTopBarIconButton>
                <PageTopBarButton render={<Link to="/scan" />} className="hidden sm:flex">
                  <CameraIcon className="size-4" />
                  Scan
                </PageTopBarButton>
              </>
            )}
            {addActionsInBar && canAdd && (
              <>
                <PageTopBarIconButton
                  onClick={onQuickAdd}
                  aria-label="Quick add"
                  className="sm:hidden"
                >
                  <SquarePlusIcon className="size-4" />
                </PageTopBarIconButton>
                <PageTopBarButton onClick={onQuickAdd} className="hidden sm:flex">
                  <SquarePlusIcon className="size-4" />
                  Quick add
                </PageTopBarButton>
              </>
            )}
            <SelectModeActions
              mode={mode}
              view={view}
              isAllSelected={isAllSelected}
              hasSelectableItems={hasCards}
              onEnterSelect={onEnterSelect}
              onExitSelect={onExitSelect}
              onSelectAll={onSelectAll}
            />
            {shareInBar && (
              <PageTopBarButton onClick={onShare} className="hidden sm:flex">
                <Share2Icon className="size-4" />
                Share
              </PageTopBarButton>
            )}
            {(showAddMenuItems ||
              canEdit ||
              canDelete ||
              canClearInbox ||
              canShare ||
              canToggleDeckbuilding) && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<PageTopBarIconButton />}>
                  <EllipsisVerticalIcon className="size-4" />
                  <span className="sr-only">Collection actions</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {showAddMenuItems && (
                    <>
                      <DropdownMenuItem render={<Link to="/scan" />}>
                        <CameraIcon className="size-4" />
                        Scan cards
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onQuickAdd}>
                        <SquarePlusIcon className="size-4" />
                        Quick add
                      </DropdownMenuItem>
                    </>
                  )}
                  {canEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <PencilIcon className="size-4" />
                      Edit collection
                    </DropdownMenuItem>
                  )}
                  {canToggleDeckbuilding && (
                    <DropdownMenuItem onClick={onToggleDeckbuilding}>
                      <LayersIcon className="size-4" />
                      {deckbuildingAvailable
                        ? "Exclude from my deck building"
                        : "Include in my deck building"}
                    </DropdownMenuItem>
                  )}
                  {canShare && (
                    <DropdownMenuItem onClick={onShare}>
                      <Share2Icon className="size-4" />
                      Share
                    </DropdownMenuItem>
                  )}
                  {canPrintBinder && (
                    <DropdownMenuItem onClick={() => setBinderSheetOpen(true)}>
                      <PrinterIcon className="size-4" />
                      Print binder sheet…
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={onDelete}
                    >
                      <Trash2Icon className="size-4" />
                      Delete collection
                    </DropdownMenuItem>
                  )}
                  {canClearInbox && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={onClearInbox}
                    >
                      <Trash2Icon className="size-4" />
                      Clear inbox
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </PageTopBarActions>
      </PageTopBar>

      {canPrintBinder && shareUrl !== undefined && (
        <BinderSheetDialog
          open={binderSheetOpen}
          onOpenChange={setBinderSheetOpen}
          shareUrl={shareUrl}
          defaultTitle={collectionName ?? title}
          defaultSubtitle="Scan to see my collection"
          filenameHint={collectionName ?? title}
        />
      )}
    </>
  );
}
