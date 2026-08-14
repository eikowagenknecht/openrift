import type { TierListResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  MaximizeIcon,
  MinimizeIcon,
  PencilIcon,
  SaveIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarHeightContext,
  PageTopBarIconButton,
  PageTopBarPrimaryButton,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { TierBoardEditor } from "@/components/tier-lists/tier-board-editor";
import { TierListDetailsDialog } from "@/components/tier-lists/tier-list-details-dialog";
import { TierListDndContext } from "@/components/tier-lists/tier-list-dnd-context";
import { TierListPool } from "@/components/tier-lists/tier-list-pool";
import { TierListShareDialog } from "@/components/tier-lists/tier-list-share-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCards } from "@/hooks/use-cards";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useDeleteTierList, useUpdateTierList } from "@/hooks/use-tier-lists";
import { downloadImageFromUrl, tierListOwnerImageUrl } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

interface TierListBuilderPageProps {
  tierList: TierListResponse;
}

/**
 * The tier list builder: the board on the left, the card pool on the right,
 * dragging between them.
 *
 * The board is the sticky column and the pool is the window-scrolled one, not
 * the other way round: the pool is a virtualized grid and its virtualizer reads
 * the *window* scroller, so putting it in an inner scroll container renders it
 * empty. A board is at most a dozen rows, so it takes the inner scroll instead
 * and stays in view while the creator scrolls the set.
 *
 * @returns The builder page node.
 */
export function TierListBuilderPage({ tierList }: TierListBuilderPageProps) {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const headerHeight = useHeaderHeight();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const { cardsById, printingsByCardId, sets } = useCards();
  const dirty = useTierListBuilderStore((state) => state.dirty);
  const loadedListId = useTierListBuilderStore((state) => state.listId);
  const scopedSetSlug = sets.find((set) => set.id === tierList.setId)?.slug;

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Board-only mode: hides the pool so the ranking fills the width for a screen
  // capture. Deliberately not persisted — it is a recording posture, not a
  // preference, and a creator who returns tomorrow wants the pool back.
  const [boardOnly, setBoardOnly] = useState(false);

  const updateTierList = useUpdateTierList();
  const deleteTierList = useDeleteTierList();

  // Adopt the saved board on mount and whenever the route switches lists. Keyed
  // on the id rather than the response object so a background refetch of an
  // unchanged list can't discard an in-progress draft.
  useEffect(() => {
    if (loadedListId !== tierList.id) {
      useTierListBuilderStore.getState().load(tierList.id, tierList.tiers);
      // Seed the pool's set filter from the list's set scope, once per visit —
      // a pre-filter the creator can still clear or change while working.
      if (scopedSetSlug) {
        void navigate({
          to: ".",
          search: (prev) => ({ ...prev, sets: [scopedSetSlug] }),
          replace: true,
        });
      }
    }
  }, [tierList.id, tierList.tiers, loadedListId, scopedSetSlug, navigate]);

  // Leaving the builder drops the draft, so returning to a list always starts
  // from what the server has rather than a board from a previous visit.
  useEffect(() => useTierListBuilderStore.getState().reset, []);

  const handleSave = () => {
    // Snapshot what actually goes to the server: markSaved compares against it,
    // so a drag landing mid-save keeps the board dirty instead of being lost.
    const rows = useTierListBuilderStore.getState().rows;
    updateTierList.mutate(
      { id: tierList.id, tiers: rows },
      {
        onSuccess: () => {
          useTierListBuilderStore.getState().markSaved(rows);
        },
        // No toast here: the QueryClient's default mutation onError owns the
        // error message for every mutation.
      },
    );
  };

  const handleExport = async () => {
    const safeName = tierList.title.replaceAll(/[^\w -]+/gu, "_").trim() || "tier-list";
    try {
      await downloadImageFromUrl(
        tierListOwnerImageUrl(getSiteUrl(), tierList.id, "hq"),
        `${safeName}.png`,
      );
    } catch {
      // A download is not a mutation, so it never reaches the global mutation
      // error handler and has to say so itself.
      toast.error("Couldn't prepare the image. Please try again.");
    }
  };

  const handleDelete = () => {
    deleteTierList.mutate(tierList.id, {
      onSuccess: () => {
        void navigate({ to: "/tier-lists" });
      },
    });
  };

  const stickyTop = headerHeight + topBarHeight;

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY}>
          <PageTopBar>
            <PageTopBarBack to="/tier-lists" aria-label="All tier lists" />
            <PageTopBarTitle>{tierList.title}</PageTopBarTitle>
            {dirty && <Badge variant="outline">Unsaved changes</Badge>}
            <PageTopBarActions>
              <PageTopBarIconButton
                aria-label={boardOnly ? "Show the card pool" : "Hide the card pool"}
                onClick={() => setBoardOnly(!boardOnly)}
              >
                {boardOnly ? (
                  <MinimizeIcon className="size-4" />
                ) : (
                  <MaximizeIcon className="size-4" />
                )}
              </PageTopBarIconButton>
              <PageTopBarButton onClick={() => setShareOpen(true)}>
                <Share2Icon />
                Share
              </PageTopBarButton>
              <PageTopBarPrimaryButton
                onClick={handleSave}
                disabled={!dirty || updateTierList.isPending}
              >
                <SaveIcon />
                Save
              </PageTopBarPrimaryButton>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<PageTopBarIconButton aria-label="Tier list options" />}
                >
                  <EllipsisVerticalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDetailsOpen(true)}>
                    <PencilIcon />
                    Rename and describe
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleExport()}>
                    <DownloadIcon />
                    Download image
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2Icon />
                    Delete tier list
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </PageTopBarActions>
          </PageTopBar>
        </div>

        <TierListDndContext cardsById={cardsById} printingsByCardId={printingsByCardId}>
          <div className="px-safe flex flex-1 flex-col gap-4 px-3 pt-3 lg:flex-row">
            <div
              className={cn(
                "w-full",
                boardOnly ? "lg:max-w-none" : "shrink-0 lg:w-[46%] lg:max-w-3xl",
              )}
            >
              <div
                className="lg:sticky lg:overflow-y-auto"
                style={{ top: stickyTop, maxHeight: `calc(100dvh - ${stickyTop}px)` }}
              >
                <TierBoardEditor
                  cardsById={cardsById}
                  printingsByCardId={printingsByCardId}
                  tapToAssign={isMobile}
                />
              </div>
            </div>
            {!boardOnly && <TierListPool />}
          </div>
        </TierListDndContext>
      </div>

      <TierListDetailsDialog tierList={tierList} open={detailsOpen} onOpenChange={setDetailsOpen} />
      <TierListShareDialog
        tierListId={tierList.id}
        isPublic={tierList.isPublic}
        shareToken={tierList.shareToken}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tier list?</AlertDialogTitle>
            <AlertDialogDescription>
              {tierList.title} and its ranking are removed for good. Any share link stops working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteTierList.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTopBarHeightContext>
  );
}
