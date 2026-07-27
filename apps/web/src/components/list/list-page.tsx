import type { Currency, TradePreference } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  LibraryBigIcon,
  PencilIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { use, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageTopBarButton, PageTopBarIconButton } from "@/components/layout/page-top-bar";
import { listKindIcon } from "@/components/list/create-list-dialog";
import { DeleteListDialog } from "@/components/list/delete-list-dialog";
import { ListEditDialog } from "@/components/list/list-edit-dialog";
import { emptyStateCopy } from "@/components/list/list-entries";
import { ListEntryBrowser } from "@/components/list/list-entry-browser";
import { ListExportDialog } from "@/components/list/list-export-dialog";
import { ListGroupVisibilityDialog } from "@/components/list/list-group-visibility-dialog";
import { ListHeader } from "@/components/list/list-header";
import { ListImportDialog } from "@/components/list/list-import-dialog";
import { ListShareDialog } from "@/components/list/list-share-dialog";
import { ListVisibilityButton } from "@/components/list/list-visibility-button";
import { RuleEditorDialog } from "@/components/list/rule-editor-dialog";
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
import { cn } from "@/lib/utils";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";

interface ListPageProps {
  listId: string;
}

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
  const [showLibrary, setShowLibrary] = useState(false);
  const showLibraryActive = showLibrary && data.list.kind !== "copy";

  // Switching lists resets the toggle so the user doesn't land in library
  // view on the new list by surprise. Mirrors the same reset the collection
  // grid does on collectionId change.
  useEffect(() => {
    setShowLibrary(false);
  }, [listId]);

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

  const topBar = (
    <ListHeader
      list={data.list}
      entries={data.entries}
      attribution={{ kind: "none" }}
      onToggleSidebar={toggleSidebar}
      actions={
        <>
          {data.list.intent !== "organize" && (
            <PageTopBarButton
              onClick={() => setRuleOpen(true)}
              className={cn(activeRuleCount > 0 && "text-primary")}
            >
              <SparklesIcon className="size-4" />
              {data.list.intent === "wish" ? "Dynamic rules" : "Dynamic rule"}
              {data.list.intent === "wish" && activeRuleCount > 0 ? ` · ${activeRuleCount}` : null}
            </PageTopBarButton>
          )}
          <ListVisibilityButton
            listId={data.list.id}
            intent={data.list.intent}
            onManageVisibility={() => setVisibilityOpen(true)}
          />
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
              <DropdownMenuItem onClick={() => setShareOpen(true)}>
                <Share2Icon className="size-4" />
                Share
              </DropdownMenuItem>
              {(data.list.kind === "card" || data.list.kind === "printing") && (
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <UploadIcon className="size-4" />
                  Import
                </DropdownMenuItem>
              )}
              {data.list.kind === "card" && (
                <DropdownMenuItem onClick={() => setExportOpen(true)}>
                  <DownloadIcon className="size-4" />
                  Export
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

  const topBarPortal = topBarSlot && createPortal(topBar, topBarSlot);

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

  const exportDialog = data.list.kind === "card" && (
    <ListExportDialog entries={data.entries} open={exportOpen} onOpenChange={setExportOpen} />
  );

  const importDialog = (data.list.kind === "card" || data.list.kind === "printing") && (
    <ListImportDialog
      listId={listId}
      listKind={data.list.kind}
      open={importOpen}
      onOpenChange={setImportOpen}
    />
  );

  // Mounted only while open so its catalog/collections queries are paid on
  // demand, not on every list view (ADR-034).
  const ruleDialog = data.list.intent !== "organize" && ruleOpen && (
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
        {topBarPortal}
        <EmptyState
          className="flex-1"
          icon={KindIcon}
          title={empty.title}
          description={
            <>
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
          {canShowLibrary && (
            <Button onClick={() => setShowLibrary(true)}>
              <LibraryBigIcon />
              Show library
            </Button>
          )}
        </EmptyState>
        {editDialog}
        {deleteDialog}
        {shareDialog}
        {visibilityDialog}
        {exportDialog}
        {importDialog}
        {ruleDialog}
      </>
    );
  }

  return (
    <>
      {topBarPortal}
      <ListEntryBrowser
        listId={listId}
        kind={data.list.kind}
        intent={data.list.intent}
        listTradeDefaults={data.list.tradeDefaults}
        listCurrency={data.list.currency}
        rules={data.list.rules}
        entries={data.entries}
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
      {visibilityDialog}
      {exportDialog}
      {importDialog}
      {ruleDialog}
    </>
  );
}
