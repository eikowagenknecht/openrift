import { formatDay } from "@openrift/shared/format-date";
import type { TierListSummaryResponse } from "@openrift/shared/types/api/tier-list";
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
import { useCards } from "@/features/cards/hooks/use-cards";
import { CreateTierListDialog } from "@/features/stage/components/create-tier-list-dialog";
import { TierRowFrame } from "@/features/stage/components/tier-board";
import { TierCardTile } from "@/features/stage/components/tier-card-tile";
import { TierListShareDialog } from "@/features/stage/components/tier-list-share-dialog";
import { useDeleteTierList, useTierLists } from "@/features/stage/hooks/use-tier-lists";
import { resolveTierRows } from "@/features/stage/lib/tier-list-presentation";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

const PREVIEW_TILE_WIDTH = 40;

export function TierListIndexPage() {
  const { data: tierLists } = useTierLists();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <PageTopBarSticky width="capped">
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

      <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING, "flex flex-col gap-4 pt-3 pb-6")}>
        <PageDescription>
          Rank a set, then share the link or drop the exported image into a video.
        </PageDescription>

        {tierLists.length === 0 ? (
          <EmptyState
            icon={LayersIcon}
            title="No tier lists yet"
            description={
              <>
                Stack cards into rows you name yourself, then share the board as a link, download it
                as an image, or rank it live on stream.{" "}
                <Link
                  to="/help/$slug"
                  params={{ slug: "tier-lists" }}
                  className="text-primary hover:underline"
                >
                  Learn how tier lists work.
                </Link>
              </>
            }
          >
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon />
              New tier list
            </Button>
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
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

  const resolved = resolveTierRows(tierList.previewRows, cardsById, printingsByCardId);
  const preview = tierList.previewRows.map((row, index) => ({
    ...row,
    cards: resolved[index]?.cards ?? [],
  }));

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
            {formatDay(tierList.updatedAt)}
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
        <div className="flex flex-col gap-1">
          {preview.map((row) => (
            <TierRowFrame
              key={row.rowIndex}
              rowIndex={row.rowIndex}
              unranked={row.unranked}
              label={row.label}
              tileWidth={PREVIEW_TILE_WIDTH}
              clip
            >
              {row.cards.map((view) => (
                <TierCardTile key={view.cardId} view={view} width={PREVIEW_TILE_WIDTH} />
              ))}
            </TierRowFrame>
          ))}
        </div>
      )}

      <TierListShareDialog
        tierListId={tierList.id}
        title={tierList.title}
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
