import { Link } from "@tanstack/react-router";
import {
  CameraIcon,
  EllipsisVerticalIcon,
  LayersIcon,
  PencilIcon,
  Share2Icon,
  SquarePlusIcon,
  Trash2Icon,
} from "lucide-react";

import { SelectModeActions } from "@/components/cards/select-mode-actions";
import { CollectionValueSummary } from "@/components/collection/collection-value-summary";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarIconButton,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CollectionTopBarProps {
  title: string;
  onToggleSidebar: () => void;
  mode: "browse" | "select";
  valueCents: number | null | undefined;
  unpricedCount: number | null | undefined;
  formatValue: (value: number) => string;
  addTarget?: string;
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
  onEdit: () => void;
  onDelete: () => void;
  onClearInbox: () => void;
  onShare: () => void;
  onToggleDeckbuilding: () => void;
}

export function CollectionTopBar({
  title,
  onToggleSidebar,
  mode,
  valueCents,
  unpricedCount,
  formatValue,
  addTarget,
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
  onEdit,
  onDelete,
  onClearInbox,
  onShare,
  onToggleDeckbuilding,
}: CollectionTopBarProps) {
  return (
    <PageTopBar>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <PageTopBarTitle onToggleSidebar={onToggleSidebar}>{title}</PageTopBarTitle>

        <CollectionValueSummary
          valueCents={valueCents}
          unpricedCount={unpricedCount}
          formatValue={formatValue}
        />
      </div>

      <PageTopBarActions>
        <div className="flex items-center gap-2">
          {addTarget && mode === "browse" && (
            <>
              <PageTopBarIconButton
                render={<Link to="/collections/scan" />}
                aria-label="Scan cards"
                className="sm:hidden"
              >
                <CameraIcon className="size-4" />
              </PageTopBarIconButton>
              <PageTopBarButton render={<Link to="/collections/scan" />} className="hidden sm:flex">
                <CameraIcon className="size-4" />
                Scan
              </PageTopBarButton>
            </>
          )}
          {addTarget && hasCards && (
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
          {(canEdit || canDelete || canClearInbox || canShare || canToggleDeckbuilding) && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<PageTopBarIconButton />}>
                <EllipsisVerticalIcon className="size-4" />
                <span className="sr-only">Collection actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
  );
}
