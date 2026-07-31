import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  CheckSquareIcon,
  EllipsisVerticalIcon,
  LayersIcon,
  PencilIcon,
  ScanLineIcon,
  Share2Icon,
  SquarePlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { CollectionValueSummary } from "@/components/collection/collection-value-summary";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarIconButton,
  PageTopBarPrimaryButton,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";

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
  const scannerEnabled = useFeatureEnabled("scanner");
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
          {scannerEnabled && addTarget && mode === "browse" && (
            <>
              <PageTopBarIconButton
                render={<Link to="/collections/scan" />}
                aria-label="Scan cards"
                className="sm:hidden"
              >
                <ScanLineIcon className="size-4" />
              </PageTopBarIconButton>
              <PageTopBarButton render={<Link to="/collections/scan" />} className="hidden sm:flex">
                <ScanLineIcon className="size-4" />
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
          {mode === "select" ? (
            <>
              <PageTopBarIconButton
                onClick={onSelectAll}
                aria-label={isAllSelected ? "Deselect all" : "Select all"}
                className="sm:hidden"
              >
                <CheckIcon className="size-4" />
              </PageTopBarIconButton>
              <PageTopBarButton onClick={onSelectAll} className="hidden sm:flex">
                <CheckIcon className="size-4" />
                {isAllSelected ? "Deselect all" : "Select all"}
              </PageTopBarButton>
              <PageTopBarIconButton onClick={onExitSelect} aria-label="Done" className="sm:hidden">
                <XIcon className="size-4" />
              </PageTopBarIconButton>
              <PageTopBarPrimaryButton onClick={onExitSelect} className="hidden sm:flex">
                Done
              </PageTopBarPrimaryButton>
            </>
          ) : (
            hasCards && (
              <>
                <PageTopBarIconButton
                  onClick={onEnterSelect}
                  aria-label={`Manage ${view}`}
                  className="sm:hidden"
                >
                  <CheckSquareIcon className="size-4" />
                </PageTopBarIconButton>
                <PageTopBarButton onClick={onEnterSelect} className="hidden sm:flex">
                  <CheckSquareIcon className="size-4" />
                  Manage {view}
                </PageTopBarButton>
              </>
            )
          )}
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
