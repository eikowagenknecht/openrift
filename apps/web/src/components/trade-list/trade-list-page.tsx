import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  EllipsisVerticalIcon,
  HandshakeIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { use, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { PageTopBar, PageTopBarActions, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { DeleteTradeListDialog } from "@/components/trade-list/delete-trade-list-dialog";
import { TradeListShareDialog } from "@/components/trade-list/trade-list-share-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/components/ui/sidebar";
import { useCards } from "@/hooks/use-cards";
import {
  useDeleteTradeList,
  useRemoveTradeListItem,
  useTradeListDetail,
  useUpdateTradeList,
} from "@/hooks/use-trade-lists";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";

interface TradeListPageProps {
  tradeListId: string;
}

export function TradeListPage({ tradeListId }: TradeListPageProps) {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const { data } = useTradeListDetail(tradeListId);
  const { printingsById } = useCards();
  const display = useCardThumbnailDisplay();

  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(data.tradeList.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const updateTradeList = useUpdateTradeList();
  const deleteTradeList = useDeleteTradeList();
  const removeItem = useRemoveTradeListItem();

  const submitRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === data.tradeList.name) {
      setIsRenaming(false);
      setName(data.tradeList.name);
      return;
    }
    updateTradeList.mutate(
      { tradeListId, name: trimmed },
      {
        onSuccess: () => setIsRenaming(false),
      },
    );
  };

  const handleDelete = () => {
    deleteTradeList.mutate(tradeListId, {
      onSuccess: () => {
        setDeleteOpen(false);
        void navigate({ to: "/collections" });
      },
    });
  };

  const handleRemove = (itemId: string, cardName: string) => {
    removeItem.mutate(
      { tradeListId, itemId },
      {
        onSuccess: () => toast.success(`Removed ${cardName} from trade list`),
      },
    );
  };

  const topBar = (
    <PageTopBar>
      {isRenaming ? (
        <form
          className="flex flex-1 items-center gap-2 px-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitRename();
          }}
        >
          <Input
            autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional for inline rename
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={submitRename}
            className="h-8 max-w-xs"
          />
          <Button type="submit" variant="ghost" size="icon-sm" disabled={updateTradeList.isPending}>
            <CheckIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setIsRenaming(false);
              setName(data.tradeList.name);
            }}
          >
            <XIcon className="size-4" />
          </Button>
        </form>
      ) : (
        <>
          <PageTopBarTitle onToggleSidebar={toggleSidebar}>{data.tradeList.name}</PageTopBarTitle>
          <span className="text-muted-foreground hidden shrink-0 items-center text-xs sm:flex">
            {data.items.length} {data.items.length === 1 ? "copy" : "copies"}
          </span>
        </>
      )}
      <PageTopBarActions>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
            <EllipsisVerticalIcon className="size-4" />
            <span className="sr-only">Trade list actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsRenaming(true)}>
              <PencilIcon className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <Share2Icon className="size-4" />
              {data.tradeList.shareToken === null ? "Share" : "Manage sharing"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon className="size-4" />
              Delete trade list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageTopBarActions>
    </PageTopBar>
  );

  const topBarPortal = topBarSlot && createPortal(topBar, topBarSlot);

  const deleteDialog = (
    <DeleteTradeListDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      tradeListName={data.tradeList.name}
      itemCount={data.items.length}
      onConfirm={handleDelete}
      isPending={deleteTradeList.isPending}
    />
  );

  const shareDialog = (
    <TradeListShareDialog
      tradeListId={tradeListId}
      shareToken={data.tradeList.shareToken}
      open={shareOpen}
      onOpenChange={setShareOpen}
    />
  );

  if (data.items.length === 0) {
    return (
      <>
        {topBarPortal}
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia>
              <HandshakeIcon className="size-16 opacity-50" />
            </EmptyMedia>
            <EmptyTitle>No copies on this trade list yet</EmptyTitle>
            <EmptyDescription>
              Open a collection, select copies, and use the &ldquo;Add to trade list&rdquo; action
              to put them here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent />
        </Empty>
        {deleteDialog}
        {shareDialog}
      </>
    );
  }

  return (
    <>
      {topBarPortal}
      <div className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {data.items.map((item) => {
          const printing = printingsById[item.printingId];
          if (!printing) {
            return null;
          }
          return (
            <div key={item.id} className="flex flex-col gap-1">
              <CardThumbnail
                printing={printing}
                onClick={() =>
                  void navigate({
                    to: "/cards/$cardSlug",
                    params: { cardSlug: printing.card.slug },
                  })
                }
                showImages
                view="printings"
                display={display}
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(item.id, item.cardName)}
                disabled={removeItem.isPending && removeItem.variables?.itemId === item.id}
              >
                <Trash2Icon className="size-3.5" />
                Remove
              </Button>
            </div>
          );
        })}
      </div>
      {deleteDialog}
      {shareDialog}
    </>
  );
}
