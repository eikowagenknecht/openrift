import type { TierListResponse } from "@openrift/shared";
import { getOrientation, imageUrl } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  MonitorPlayIcon,
  PencilIcon,
  SaveIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import type { TierCardView } from "@/components/tier-lists/tier-card-tile";
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
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useDeleteTierList, useUpdateTierList } from "@/hooks/use-tier-lists";
import { frontImageId } from "@/lib/card-meta";
import { downloadImageFromUrl, tierListOwnerImageUrl } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

interface TierListBuilderPageProps {
  tierList: TierListResponse;
}

/**
 * The tier list builder: the board on the left, the card pool on the right,
 * dragging between them. Laid out in the shared {@link BuilderWorkbench}, which
 * owns why the board is the sticky column and the pool the scrolled one.
 *
 * @returns The builder page node.
 */
export function TierListBuilderPage({ tierList }: TierListBuilderPageProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const { cardsById, printingsByCardId } = useCards();
  const dirty = useTierListBuilderStore((state) => state.dirty);
  const loadedListId = useTierListBuilderStore((state) => state.listId);
  // Presentation mode is a creator tool that ships dark: the route works by URL,
  // but nothing in the app points at it until the flag is on.
  const presentEnabled = useFeatureEnabled("overlay");
  // Counted off the saved board rather than the draft: that is what the show
  // would actually put on screen.
  const rankedCount = tierList.tiers.reduce((sum, tier) => sum + tier.cards.length, 0);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Floating preview for the tile under the pointer, the same affordance the
  // deck builder gives its rows. Anchored to the two-column container rather
  // than the board's own sticky box, which clips its overflow.
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

  // Adopt the saved board on mount and whenever the route switches lists. Keyed
  // on the id rather than the response object so a background refetch of an
  // unchanged list can't discard an in-progress draft.
  useEffect(() => {
    if (loadedListId !== tierList.id) {
      useTierListBuilderStore.getState().load(tierList.id, tierList.tiers);
    }
  }, [tierList.id, tierList.tiers, loadedListId]);

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
                {presentEnabled && rankedCount > 0 && (
                  <PageTopBarButton
                    // Presentation mode reads the *saved* board, so an unsaved
                    // draft would go on stage as whatever the server still
                    // holds. The "Unsaved changes" badge sits in this same bar
                    // and says why the button is off.
                    disabled={dirty}
                    onClick={() => {
                      void navigate({ to: "/present", search: { tier: tierList.id, i: 0 } });
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
          }
        >
          <TierListPool />
        </BuilderWorkbench>
      </TierListDndContext>

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
    </>
  );
}
