import type { TierListSummaryResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { EllipsisVerticalIcon, LayersIcon, PlusIcon, Share2Icon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { CreateTierListDialog } from "@/components/tier-lists/create-tier-list-dialog";
import { TierCardTile } from "@/components/tier-lists/tier-card-tile";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCards } from "@/hooks/use-cards";
import { useDeleteTierList, useTierLists } from "@/hooks/use-tier-lists";
import { formatAbsoluteDate } from "@/lib/format-date";
import { CONTAINER_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";

/**
 * Tile width for the index's preview strip. Fixed rather than following the
 * board's size preference: this is a thumbnail of a list, not the board itself.
 */
const PREVIEW_TILE_WIDTH = 40;

/**
 * "My tier lists": everything the signed-in creator has built, newest edit
 * first, with a preview strip of the top-ranked cards.
 *
 * @returns The index page node.
 */
export function TierListIndexPage() {
  const { data: tierLists } = useTierLists();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <PageTopBarSticky maxWidth="container">
        <PageTopBar>
          <PageTopBarTitle>Tier lists</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarPrimaryButton onClick={() => setCreateOpen(true)}>
              <PlusIcon />
              New tier list
            </PageTopBarPrimaryButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_PADDING, CONTAINER_WIDTH, "flex flex-col gap-4 pt-3 pb-6")}>
        <PageDescription>
          Rank a set, then share the link or drop the exported image into a video.
        </PageDescription>

        {tierLists.length === 0 ? (
          <EmptyState
            icon={LayersIcon}
            title="No tier lists yet"
            description="Build one to rank a set, then share it as a link or an image."
          >
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon />
              New tier list
            </Button>
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tierLists.map((tierList) => (
              <TierListRow key={tierList.id} tierList={tierList} />
            ))}
          </div>
        )}
      </div>

      <CreateTierListDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function TierListRow({ tierList }: { tierList: TierListSummaryResponse }) {
  const { cardsById, printingsByCardId } = useCards();
  const deleteTierList = useDeleteTierList();
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const preview = tierList.previewCards.flatMap((entry) => {
    const card = cardsById[entry.cardId];
    if (!card) {
      return [];
    }
    const printings = printingsByCardId.get(entry.cardId);
    // Same fallback chain as the board: the creator's pinned printing when it
    // still resolves, otherwise the card's default.
    const pinned = entry.printingId
      ? printings?.find((printing) => printing.id === entry.printingId)
      : undefined;
    return [
      {
        cardId: entry.cardId,
        card,
        printing: pinned ?? printings?.[0],
        pinnedPrintingId: entry.printingId,
      },
    ];
  });

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to="/tier-lists/$tierListId"
            params={{ tierListId: tierList.id }}
            className="font-heading hover:underline"
          >
            {tierList.title}
          </Link>
          <p className="text-muted-foreground text-sm">
            {tierList.cardCount} {tierList.cardCount === 1 ? "card" : "cards"} across{" "}
            {tierList.tierCount} {tierList.tierCount === 1 ? "tier" : "tiers"} · edited{" "}
            {formatAbsoluteDate(tierList.updatedAt)}
          </p>
        </div>
        {tierList.isPublic && tierList.shareToken && <Badge variant="outline">Shared</Badge>}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`${tierList.title} options`} />
            }
          >
            <EllipsisVerticalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <Share2Icon />
              Share
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {preview.length > 0 && (
        <div className="flex gap-1 overflow-hidden">
          {preview.map((view) => (
            <TierCardTile key={view.cardId} view={view} width={PREVIEW_TILE_WIDTH} />
          ))}
        </div>
      )}

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
            <AlertDialogAction
              onClick={() => {
                // No navigation on success: this page *is* /tier-lists, and the
                // mutation's invalidation refreshes the listing.
                deleteTierList.mutate(tierList.id);
              }}
              disabled={deleteTierList.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
