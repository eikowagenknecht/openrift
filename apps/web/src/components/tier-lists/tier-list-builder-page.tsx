import type { TierListResponse } from "@openrift/shared";
import { getOrientation, imageUrl } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import {
  EllipsisVerticalIcon,
  ListOrderedIcon,
  MonitorPlayIcon,
  PencilIcon,
  SaveIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import { BuilderWorkbench } from "@/components/layout/builder-workbench";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarIconButton,
  PageTopBarPrimaryButton,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { TierBoardEditor } from "@/components/tier-lists/tier-board-editor";
import { TierListDetailsDialog } from "@/components/tier-lists/tier-list-details-dialog";
import { TierListDndContext } from "@/components/tier-lists/tier-list-dnd-context";
import { TierListPool } from "@/components/tier-lists/tier-list-pool";
import { TierListShareDialog } from "@/components/tier-lists/tier-list-share-dialog";
import { TierTileSizeControls } from "@/components/tier-lists/tier-tile-size-controls";
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
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useDeleteTierList, useUpdateTierList } from "@/hooks/use-tier-lists";
import { frontImageId } from "@/lib/card-meta";
import type { TierCardView } from "@/lib/tier-list-presentation";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

interface TierListBuilderPageProps {
  tierList: TierListResponse;
}

export function TierListBuilderPage({ tierList }: TierListBuilderPageProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const { cardsById, printingsByCardId } = useCards();
  const dirty = useTierListBuilderStore((state) => state.dirty);
  const loadedListId = useTierListBuilderStore((state) => state.listId);
  // Counted from the saved board, not the draft state.
  const rankedCount = tierList.tiers.reduce((sum, tier) => sum + tier.cards.length, 0);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Anchored to the two-column container: the board's own sticky box clips
  // overflow, which would cut off the floating preview.
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredView, setHoveredView] = useState<TierCardView | null>(null);
  const hoveredImageId = hoveredView ? frontImageId(hoveredView.printing) : null;
  const hoveredCard = hoveredImageId
    ? {
        thumbnailUrl: imageUrl(hoveredImageId, "400w"),
        fullUrl: imageUrl(hoveredImageId, "full"),
        landscape: getOrientation(hoveredView?.card.types ?? []) === "landscape",
      }
    : null;

  const updateTierList = useUpdateTierList();
  const deleteTierList = useDeleteTierList();

  // Keyed on the id, not the response object, so a background refetch of an
  // unchanged list can't discard an in-progress draft.
  useEffect(() => {
    if (loadedListId !== tierList.id) {
      useTierListBuilderStore.getState().load(tierList.id, tierList.tiers);
    }
  }, [tierList.id, tierList.tiers, loadedListId]);

  useEffect(() => useTierListBuilderStore.getState().reset, []);

  const handleSave = () => {
    // Snapshot the rows here: markSaved compares against this snapshot, so a
    // drag landing mid-save still leaves the board marked dirty.
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

  const handleDelete = () => {
    deleteTierList.mutate(tierList.id, {
      onSuccess: () => {
        void navigate({ to: "/tier-lists" });
      },
    });
  };

  return (
    <>
      <TierListDndContext cardsById={cardsById} printingsByCardId={printingsByCardId}>
        <BuilderWorkbench
          asideClassName="lg:w-[46%] lg:max-w-3xl"
          columnsRef={previewContainerRef}
          overlay={
            <HoveredCardPreview
              hoveredCard={isMobile ? null : hoveredCard}
              origin="main"
              containerRef={previewContainerRef}
            />
          }
          aside={
            <TierBoardEditor
              cardsById={cardsById}
              printingsByCardId={printingsByCardId}
              tapToAssign={isMobile}
              onHoverCard={setHoveredView}
            />
          }
          topBar={
            <PageTopBar>
              <PageTopBarBack to="/tier-lists" aria-label="All tier lists" />
              <PageTopBarTitle>{tierList.title}</PageTopBarTitle>
              {dirty && <Badge variant="outline">Unsaved changes</Badge>}
              <PageTopBarActions>
                <TierTileSizeControls />
                {rankedCount > 0 && (
                  <PageTopBarButton
                    // The stage reads the saved board, so an unsaved draft would
                    // go up as whatever the server still holds.
                    disabled={dirty}
                    onClick={() => {
                      void navigate({ to: "/stage", search: { tier: tierList.id, i: 0 } });
                    }}
                  >
                    <MonitorPlayIcon />
                    Present
                  </PageTopBarButton>
                )}
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
                    <DropdownMenuItem
                      // Same reason as Present: the stage opens from the saved
                      // board. No rankedCount gate, an all-unranked board is fine.
                      disabled={dirty}
                      onClick={() => {
                        void navigate({
                          to: "/stage",
                          search: { tier: tierList.id, mode: "edit" },
                        });
                      }}
                    >
                      <ListOrderedIcon />
                      Rank live on stage
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDetailsOpen(true)}>
                      <PencilIcon />
                      Rename and describe
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
          }
        >
          <TierListPool />
        </BuilderWorkbench>
      </TierListDndContext>

      <TierListDetailsDialog tierList={tierList} open={detailsOpen} onOpenChange={setDetailsOpen} />
      <TierListShareDialog
        tierListId={tierList.id}
        title={tierList.title}
        isPublic={tierList.isPublic}
        shareToken={tierList.shareToken}
        // The image is rendered server-side from the saved board, so a draft
        // that hasn't been saved yet exports as whatever the server still holds.
        dirty={dirty}
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
    </>
  );
}
