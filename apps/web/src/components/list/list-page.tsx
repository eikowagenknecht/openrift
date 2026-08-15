import type { Currency, ListIntent, TradePreference } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  LibraryBigIcon,
  PencilIcon,
  PrinterIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { use, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageTopBarButton, PageTopBarIconButton } from "@/components/layout/page-top-bar";
import { listKindIcon } from "@/components/list/create-list-dialog";
import { DeleteListDialog } from "@/components/list/delete-list-dialog";
import { ListEditDialog } from "@/components/list/list-edit-dialog";
import { emptyStateCopy, listCopyIds } from "@/components/list/list-entries";
import { ListEntryBrowser } from "@/components/list/list-entry-browser";
import { ListExportDialog } from "@/components/list/list-export-dialog";
import { ListGroupVisibilityDialog } from "@/components/list/list-group-visibility-dialog";
import { ListHeader } from "@/components/list/list-header";
import { ListImportDialog } from "@/components/list/list-import-dialog";
import { ListShareDialog } from "@/components/list/list-share-dialog";
import { ListVisibilityMenuItem } from "@/components/list/list-visibility-menu-item";
import { MoveCopiesToCollectionDialog } from "@/components/list/move-copies-to-collection-dialog";
import { RuleEditorDialog } from "@/components/list/rule-editor-dialog";
import { BinderSheetDialog } from "@/components/share/binder-sheet-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import {
  useDeleteList,
  useListDetail,
  useRemoveListEntry,
  useUpdateList,
  useUpdateListEntry,
} from "@/hooks/use-lists";
import { getSiteUrl } from "@/lib/site-config";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useLibraryToggle } from "@/stores/library-toggle-store";

interface ListPageProps {
  listId: string;
}

/** Prefilled instruction line on the printed binder sheet, per list intent. */
const BINDER_SUBTITLES: Record<ListIntent, string> = {
  wish: "Scan to see my wishlist",
  trade: "Scan to see my trades",
  organize: "Scan to see this list",
};

export function ListPage({ listId }: ListPageProps) {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const { data } = useListDetail(listId);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [moveAllOpen, setMoveAllOpen] = useState(false);
  const [binderSheetOpen, setBinderSheetOpen] = useState(false);

  const deleteList = useDeleteList();
  const removeEntry = useRemoveListEntry();
  const updateEntry = useUpdateListEntry();
  const updateList = useUpdateList();

  const KindIcon = listKindIcon(data.list.kind);
  const empty = emptyStateCopy(data.list.kind);

  // Per-session library toggle: when on, the grid renders the whole catalog
  // so the user can add cards. Copy-kind lists can't add via the catalog (a
  // "copy" only exists inside a collection; the float-bar / sidebar DnD are
  // the canonical paths), so the toggle is hidden for them.
  // The value lives in library-toggle-store, so it survives switching lists
  // (adding cards to several lists in a row shouldn't mean turning the
  // library back on each time) but still starts off on a fresh page load.
  const [showLibrary, setShowLibrary] = useLibraryToggle("list");
  const showLibraryActive = showLibrary && data.list.kind !== "copy";

  const handleDelete = () => {
    deleteList.mutate(listId, {
      onSuccess: () => {
        setDeleteOpen(false);
        void navigate({ to: "/collections" });
      },
    });
  };

  const handleRemoveEntry = (entryId: string, cardName: string) => {
    removeEntry.mutate(
      { listId, entryId },
      {
        onSuccess: () => toast.success(`Removed ${cardName} from list`),
      },
    );
  };

  const handleQuantityChange = (entryId: string, quantity: number) => {
    updateEntry.mutate({ listId, entryId, quantity });
  };

  const handleTradeOverrideChange = (
    entryId: string,
    tradeOverride: TradePreference,
    listCurrencyToSet?: Currency,
  ) => {
    // The dialog asks the user for a currency when the list doesn't have one
    // yet and they pick an absolute price. Patch the list first so the entry
    // update applies against a list that already has a currency, and so the
    // user doesn't have to open Edit list separately afterwards.
    if (listCurrencyToSet) {
      updateList.mutate({ listId, currency: listCurrencyToSet });
    }
    updateEntry.mutate({ listId, entryId, tradeOverride });
  };

  const entriesCount = data.entries.length;
  const activeRuleCount = data.list.rules.length;

  // Copy-kind lists sit on top of physical copies, so the whole list can be
  // filed into another collection in one go — the "sorted out, now move it to
  // the bulk box" path. It deliberately targets every copy on the list rather
  // than the grid's current filter or selection: rule-produced entries can't be
  // selected (ADR-034), and they're exactly the ones a dynamic bulk list is
  // made of. Per-entry and per-selection moves live in the grid context menu.
  const allCopyIds = listCopyIds(data.entries);

  // The binder sheet prints a QR of the public link, so it only applies once
  // the list has one.
  const shareUrl = data.list.shareToken
    ? `${getSiteUrl()}/lists/share/${data.list.shareToken}`
    : null;

  // The bar is assembled here (it belongs to the page) but rendered by the
  // browser, which owns select mode — hence the callback. Share is the one
  // action promoted out of the ⋮ menu; everything else stays in it, so the bar
  // still has room for Select all / Done on a phone.
  const renderTopBar = (selectActions: ReactNode = null) => {
    const topBar = (
      <ListHeader
        list={data.list}
        entries={data.entries}
        attribution={{ kind: "none" }}
        onToggleSidebar={toggleSidebar}
        actions={
          <>
            {selectActions}
            <PageTopBarButton onClick={() => setShareOpen(true)}>
              <Share2Icon className="size-4" />
              Share
            </PageTopBarButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<PageTopBarIconButton />}>
                <EllipsisVerticalIcon className="size-4" />
                <span className="sr-only">List actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <PencilIcon className="size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRuleOpen(true)}>
                  <SparklesIcon className="size-4" />
                  Dynamic rules
                  {activeRuleCount > 0 ? (
                    <span className="text-primary ml-auto pl-3 text-xs">{activeRuleCount}</span>
                  ) : null}
                </DropdownMenuItem>
                <ListVisibilityMenuItem
                  listId={data.list.id}
                  intent={data.list.intent}
                  onManageVisibility={() => setVisibilityOpen(true)}
                />
                {(data.list.kind === "card" || data.list.kind === "printing") && (
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <UploadIcon className="size-4" />
                    Import…
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setExportOpen(true)}>
                  <DownloadIcon className="size-4" />
                  Export…
                </DropdownMenuItem>
                {shareUrl !== null && (
                  <DropdownMenuItem onClick={() => setBinderSheetOpen(true)}>
                    <PrinterIcon className="size-4" />
                    Print binder sheet…
                  </DropdownMenuItem>
                )}
                {allCopyIds.length > 0 && (
                  <DropdownMenuItem onClick={() => setMoveAllOpen(true)}>
                    <BookOpenIcon className="size-4" />
                    Move all to collection
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2Icon className="size-4" />
                  Delete list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
    );

    return topBarSlot ? createPortal(topBar, topBarSlot) : null;
  };

  const editDialog = (
    <ListEditDialog
      listId={listId}
      intent={data.list.intent}
      currentName={data.list.name}
      currentTradeDefaults={data.list.tradeDefaults}
      currentCurrency={data.list.currency}
      open={editOpen}
      onOpenChange={setEditOpen}
    />
  );

  const deleteDialog = (
    <DeleteListDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      listName={data.list.name}
      kind={data.list.kind}
      entryCount={entriesCount}
      onConfirm={handleDelete}
      isPending={deleteList.isPending}
    />
  );

  const shareDialog = (
    <ListShareDialog
      listId={listId}
      listName={data.list.name}
      kind={data.list.kind}
      intent={data.list.intent}
      tradeDefaults={data.list.tradeDefaults}
      currency={data.list.currency}
      shareToken={data.list.shareToken}
      updatedAt={data.list.updatedAt}
      entries={data.entries}
      open={shareOpen}
      onOpenChange={setShareOpen}
      onManageGroups={() => {
        setShareOpen(false);
        setVisibilityOpen(true);
      }}
    />
  );

  const binderSheetDialog = shareUrl !== null && (
    <BinderSheetDialog
      open={binderSheetOpen}
      onOpenChange={setBinderSheetOpen}
      shareUrl={shareUrl}
      defaultTitle={data.list.name}
      defaultSubtitle={BINDER_SUBTITLES[data.list.intent]}
      filenameHint={data.list.name}
    />
  );

  const visibilityDialog = (
    <ListGroupVisibilityDialog
      listId={listId}
      intent={data.list.intent}
      open={visibilityOpen}
      onOpenChange={setVisibilityOpen}
      onManagePublicLink={() => {
        setVisibilityOpen(false);
        setShareOpen(true);
      }}
    />
  );

  // Mounted only while open: it re-runs the grid's filter pass over every
  // entry to offer the "current filters" scope, which is wasted work on a
  // page that re-renders on each quantity tick.
  const exportDialog = exportOpen && (
    <ListExportDialog
      listName={data.list.name}
      kind={data.list.kind}
      entries={data.entries}
      open
      onOpenChange={setExportOpen}
    />
  );

  const importDialog = (data.list.kind === "card" || data.list.kind === "printing") && (
    <ListImportDialog
      listId={listId}
      listKind={data.list.kind}
      open={importOpen}
      onOpenChange={setImportOpen}
    />
  );

  const moveAllDialog = (
    <MoveCopiesToCollectionDialog
      listId={listId}
      copyIds={allCopyIds}
      open={moveAllOpen}
      onOpenChange={setMoveAllOpen}
    />
  );

  // Mounted only while open so its catalog/collections queries are paid on
  // demand, not on every list view (ADR-034).
  const ruleDialog = ruleOpen && (
    <RuleEditorDialog
      listId={listId}
      intent={data.list.intent}
      kind={data.list.kind}
      currentRules={data.list.rules}
      currentRuleCombine={data.list.ruleCombine}
      open
      onOpenChange={setRuleOpen}
    />
  );

  // When the library is shown we fall through to the browser even with zero
  // entries — the grid renders the whole catalog so the user can start adding.
  if (entriesCount === 0 && !showLibraryActive) {
    const canShowLibrary = data.list.kind !== "copy";
    return (
      <>
        {renderTopBar()}
        <EmptyState
          className="flex-1"
          icon={KindIcon}
          title={empty.title}
          description={
            <>
              {activeRuleCount > 0
                ? "Nothing matches this list's rules yet."
                : "A dynamic list fills itself: set a rule once, and every card that matches joins on its own."}{" "}
              {empty.description}{" "}
              <Link
                to="/help/$slug"
                params={{ slug: "lists" }}
                className="text-primary hover:underline"
              >
                Learn how lists work.
              </Link>
            </>
          }
        >
          {/* The rule editor leads: a dynamic list is the answer most people
              want here and the least discoverable one, since the alternatives
              (library, drag from a collection) are visible on the page already. */}
          <Button onClick={() => setRuleOpen(true)}>
            <SparklesIcon />
            {activeRuleCount > 0 ? "Edit dynamic rules" : "Set up dynamic rules"}
          </Button>
          {canShowLibrary && (
            <Button variant="outline" onClick={() => setShowLibrary(true)}>
              <LibraryBigIcon />
              Show library
            </Button>
          )}
        </EmptyState>
        {editDialog}
        {deleteDialog}
        {shareDialog}
        {binderSheetDialog}
        {visibilityDialog}
        {exportDialog}
        {importDialog}
        {ruleDialog}
        {moveAllDialog}
      </>
    );
  }

  return (
    <>
      <ListEntryBrowser
        listId={listId}
        kind={data.list.kind}
        intent={data.list.intent}
        listTradeDefaults={data.list.tradeDefaults}
        listCurrency={data.list.currency}
        rules={data.list.rules}
        entries={data.entries}
        renderTopBar={renderTopBar}
        showLibrary={showLibraryActive}
        onToggleShowLibrary={() => setShowLibrary((prev) => !prev)}
        onRemoveEntry={handleRemoveEntry}
        onQuantityChange={handleQuantityChange}
        onTradeOverrideChange={handleTradeOverrideChange}
        isRemovePendingFor={(entryId) =>
          removeEntry.isPending && removeEntry.variables?.entryId === entryId
        }
        isQuantityPendingFor={(entryId) =>
          updateEntry.isPending && updateEntry.variables?.entryId === entryId
        }
      />
      {editDialog}
      {deleteDialog}
      {shareDialog}
      {binderSheetDialog}
      {visibilityDialog}
      {exportDialog}
      {importDialog}
      {ruleDialog}
      {moveAllDialog}
    </>
  );
}
