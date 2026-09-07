import { useDndContext, useDndMonitor } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import type { ListIntent, ListResponse } from "@openrift/shared/types/api/list";
import { Link, useMatches, useParams } from "@tanstack/react-router";
import {
  BookOpenIcon,
  BoxIcon,
  ChartBarIcon,
  ChevronRightIcon,
  HistoryIcon,
  ArrowLeftRightIcon,
  InboxIcon,
  LayersIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  SectionHeader,
  SectionHeaderActions,
  SectionHeaderTitle,
} from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  NestedSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  useCollections,
  useReorderCollections,
} from "@/features/collections/hooks/use-collections";
import { deckBoxLabel } from "@/features/decks/lib/deck-box-label";
import { CreateListDialog, LIST_KIND_ICON } from "@/features/lists/components/create-list-dialog";
import { DroppableSidebarList } from "@/features/lists/components/droppable-sidebar-list";
import { ListRowMenu } from "@/features/lists/components/list-row-menu";
import { useLists, useReorderLists } from "@/features/lists/hooks/use-lists";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { asDragData } from "@/lib/dnd-data";
import { splitSidebarRows } from "@/lib/sidebar-visibility";
import type { SidebarGroupKey } from "@/stores/sidebar-fold-store";
import { moreKey, useSidebarFoldStore } from "@/stores/sidebar-fold-store";

import { CollectionRowMenu } from "./collection-row-menu";
import { CreateCollectionDialog } from "./create-collection-dialog";
import type {
  AnyDragData,
  CardDragData,
  SidebarReorderCollectionDragData,
  SidebarReorderListDragData,
} from "./dnd-types";
import { COLLECTION_DRAG_TYPES, SIDEBAR_REORDER_DRAG_TYPES } from "./dnd-types";
import { DroppableCollection } from "./droppable-collection";
import { SidebarShowMoreRow } from "./sidebar-show-more-row";
import { SIDEBAR_ROW_ICON_CLASS, SortableSidebarRow } from "./sortable-sidebar-row";

const SORTABLE_COLLECTION_PREFIX = "sortable-collection-";
const SORTABLE_LIST_PREFIX = "sortable-list-";

function MobileSidebarHeader() {
  const { setOpenMobile } = useSidebar();

  return (
    <SectionHeader className="items-center p-4 md:hidden">
      <SectionHeaderTitle level={3} as="h2">
        Collections
      </SectionHeaderTitle>
      <SectionHeaderActions>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpenMobile(false)}>
          <XIcon />
          <span className="sr-only">Close</span>
        </Button>
      </SectionHeaderActions>
    </SectionHeader>
  );
}

interface IntentGroup {
  intent: ListIntent;
  groupLabel: string;
  newButtonLabel: string;
  foldKey: SidebarGroupKey;
}

const INTENT_GROUPS: IntentGroup[] = [
  { intent: "wish", groupLabel: "Wishlists", newButtonLabel: "New wishlist", foldKey: "wish" },
  { intent: "trade", groupLabel: "Tradelists", newButtonLabel: "New tradelist", foldKey: "trade" },
  {
    intent: "organize",
    groupLabel: "Organize lists",
    newButtonLabel: "New organize list",
    foldKey: "organize",
  },
];

function CollapsibleSidebarGroup({
  label,
  foldKey,
  createLabel,
  onCreate,
  children,
}: {
  label: string;
  foldKey: SidebarGroupKey;
  createLabel: string;
  onCreate: () => void;
  children: ReactNode;
}) {
  const open = useSidebarFoldStore((state) => state.byKey[foldKey] ?? true);
  const setOpen = useSidebarFoldStore((state) => state.setOpen);

  // Opens the group first: the create action is reachable while folded, but a
  // new row would land out of sight.
  function handleCreate() {
    setOpen(foldKey, true);
    onCreate();
  }

  return (
    <Collapsible open={open} onOpenChange={(next) => setOpen(foldKey, next)}>
      <SidebarGroup>
        <SidebarGroupLabel
          className="group hover:bg-sidebar-accent cursor-pointer gap-1.5 pr-8 transition-colors"
          render={<CollapsibleTrigger />}
        >
          {/* size-3! beats SidebarGroupLabel's own [&>svg]:size-4, which would otherwise win on specificity and leave an oversized triangle leading the row. */}
          <ChevronRightIcon className="size-3! transition-transform group-data-[panel-open]:rotate-90" />
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        </SidebarGroupLabel>
        <SidebarGroupAction title={createLabel} onClick={handleCreate}>
          <PlusIcon />
          <span className="sr-only">{createLabel}</span>
        </SidebarGroupAction>
        <CollapsibleContent className="overflow-hidden transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0">
          <SidebarMenu className="gap-1">{children}</SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function SidebarCreateRow({ label, onCreate }: { label: string; onCreate: () => void }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton className="text-muted-foreground" onClick={onCreate}>
        <PlusIcon className="size-4" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// entryCount counts manual entries only, so a rule-filled list reports 0; this
// marker stands in because a real count needs a full-catalog filter pass.
function DynamicListMarker() {
  return (
    <span title="Kept up to date by a rule" className="flex shrink-0 items-center">
      <SparklesIcon className="text-primary size-3.5" aria-hidden />
      <span className="sr-only">Dynamic list</span>
    </span>
  );
}

function ListIntentGroup({
  group,
  lists,
  activeId,
  isReorderActive,
  onCreate,
}: {
  group: IntentGroup;
  lists: readonly ListResponse[];
  activeId?: string;
  isReorderActive: boolean;
  onCreate: () => void;
}) {
  const moreShown = useSidebarFoldStore((state) => state.byKey[moreKey(group.foldKey)] ?? false);
  const { rows, hiddenCount, hasHidden } = splitSidebarRows(lists, {
    expanded: moreShown,
    activeId,
  });
  const sortableIds = rows.map((row) => `${SORTABLE_LIST_PREFIX}${row.id}`);

  return (
    <CollapsibleSidebarGroup
      label={group.groupLabel}
      foldKey={group.foldKey}
      createLabel={group.newButtonLabel}
      onCreate={onCreate}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {rows.map((list) => {
          const KindIcon = LIST_KIND_ICON[list.kind];
          const dragData: SidebarReorderListDragData = {
            type: "sidebar-reorder-list",
            listId: list.id,
            intent: list.intent,
          };
          return (
            <SortableSidebarRow
              key={list.id}
              id={`${SORTABLE_LIST_PREFIX}${list.id}`}
              data={dragData}
              label={list.name}
            >
              {(handle) => (
                <ListRowMenu list={list} isActive={activeId === list.id}>
                  <DroppableSidebarList
                    listId={list.id}
                    listName={list.name}
                    listKind={list.kind}
                    listIntent={list.intent}
                    disabled={isReorderActive}
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={activeId === list.id}
                        className="group-hover/menu-item:bg-sidebar-accent group-hover/menu-item:text-sidebar-accent-foreground max-md:pr-8"
                        render={
                          <Link to="/collections/lists/$listId" params={{ listId: list.id }} />
                        }
                      >
                        <KindIcon className={SIDEBAR_ROW_ICON_CLASS} />
                        <span className="flex-1 truncate">{list.name}</span>
                        {list.hasRule && <DynamicListMarker />}
                        {list.entryCount > 0 && (
                          <Badge variant="ghost" className="text-2xs ml-auto">
                            {list.entryCount}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                      {handle}
                    </SidebarMenuItem>
                  </DroppableSidebarList>
                </ListRowMenu>
              )}
            </SortableSidebarRow>
          );
        })}
      </SortableContext>
      {(hiddenCount > 0 || (moreShown && hasHidden)) && (
        <SidebarShowMoreRow foldKey={group.foldKey} hiddenCount={hiddenCount} shown={moreShown} />
      )}
      {lists.length === 0 && <SidebarCreateRow label={group.newButtonLabel} onCreate={onCreate} />}
    </CollapsibleSidebarGroup>
  );
}

function ListsSidebarGroups({
  activeId,
  isReorderActive,
}: {
  activeId?: string;
  isReorderActive: boolean;
}) {
  const { data: lists } = useLists();
  const [createIntent, setCreateIntent] = useState<ListIntent | null>(null);

  const byIntent = Map.groupBy(lists, (list) => list.intent);

  return (
    <>
      {INTENT_GROUPS.map((group) => (
        <ListIntentGroup
          key={group.intent}
          group={group}
          lists={byIntent.get(group.intent) ?? []}
          activeId={activeId}
          isReorderActive={isReorderActive}
          onCreate={() => setCreateIntent(group.intent)}
        />
      ))}
      {createIntent !== null && (
        <CreateListDialog
          intent={createIntent}
          open
          onOpenChange={(open) => {
            if (!open) {
              setCreateIntent(null);
            }
          }}
        />
      )}
    </>
  );
}

interface SharedGroupSection {
  groupId: string;
  groupSlug: string;
  groupName: string;
  collections: ReturnType<typeof useCollections>["data"];
}

function partitionCollections(collections: ReturnType<typeof useCollections>["data"]): {
  personal: typeof collections;
  groups: SharedGroupSection[];
} {
  const personal: typeof collections = [];
  const byGroupId = new Map<string, SharedGroupSection>();
  for (const col of collections) {
    if (col.groupId && col.groupSlug && col.groupName) {
      let section = byGroupId.get(col.groupId);
      if (!section) {
        section = {
          groupId: col.groupId,
          groupSlug: col.groupSlug,
          groupName: col.groupName,
          collections: [],
        };
        byGroupId.set(col.groupId, section);
      }
      section.collections.push(col);
    } else {
      personal.push(col);
    }
  }
  const groups = [...byGroupId.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
  return { personal, groups };
}

function PersonalCollectionsGroup({
  inbox,
  collections,
  activeId,
  dragSourceCollectionId,
  isReorderActive,
  onCreate,
}: {
  inbox?: CollectionResponse;
  collections: readonly CollectionResponse[];
  activeId?: string;
  dragSourceCollectionId?: string;
  isReorderActive: boolean;
  onCreate: () => void;
}) {
  const moreShown = useSidebarFoldStore((state) => state.byKey[moreKey("collections")] ?? false);
  const { rows, hiddenCount, hasHidden } = splitSidebarRows(collections, {
    expanded: moreShown,
    activeId,
  });

  return (
    <CollapsibleSidebarGroup
      label="Collections"
      foldKey="collections"
      createLabel="New collection"
      onCreate={onCreate}
    >
      {inbox && (
        <CollectionRowMenu collection={inbox} isActive={activeId === inbox.id}>
          <DroppableCollection
            collectionId={inbox.id}
            disabled={inbox.id === dragSourceCollectionId || isReorderActive}
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeId === inbox.id}
                render={
                  <Link
                    to="/collections/$collectionId"
                    params={{ collectionId: inbox.id }}
                    search={(prev) => prev}
                  />
                }
              >
                <InboxIcon />
                <span className="flex-1 truncate">{inbox.name}</span>
                {inbox.copyCount > 0 && (
                  <Badge variant="default" className="text-2xs ml-auto">
                    {inbox.copyCount}
                  </Badge>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </DroppableCollection>
        </CollectionRowMenu>
      )}
      <SortableContext
        items={rows.map((col) => `${SORTABLE_COLLECTION_PREFIX}${col.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {rows.map((col) => (
          <SortableSidebarRow
            key={col.id}
            id={`${SORTABLE_COLLECTION_PREFIX}${col.id}`}
            data={{ type: "sidebar-reorder-collection", collectionId: col.id }}
            label={col.name}
          >
            {(handle) => (
              <CollectionRowMenu collection={col} isActive={activeId === col.id}>
                <DroppableCollection
                  collectionId={col.id}
                  disabled={col.id === dragSourceCollectionId || isReorderActive}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeId === col.id}
                      className="group-hover/menu-item:bg-sidebar-accent group-hover/menu-item:text-sidebar-accent-foreground max-md:pr-8"
                      title={deckBoxLabel(col.homeDecks)}
                      render={
                        <Link
                          to="/collections/$collectionId"
                          params={{ collectionId: col.id }}
                          search={(prev) => prev}
                        />
                      }
                    >
                      {col.homeDecks.length > 0 ? (
                        <BoxIcon className={SIDEBAR_ROW_ICON_CLASS} />
                      ) : (
                        <BookOpenIcon className={SIDEBAR_ROW_ICON_CLASS} />
                      )}
                      <span className="flex-1 truncate">{col.name}</span>
                      {col.copyCount > 0 && (
                        <Badge variant="ghost" className="text-2xs ml-auto">
                          {col.copyCount}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                    {handle}
                  </SidebarMenuItem>
                </DroppableCollection>
              </CollectionRowMenu>
            )}
          </SortableSidebarRow>
        ))}
      </SortableContext>
      {(hiddenCount > 0 || (moreShown && hasHidden)) && (
        <SidebarShowMoreRow foldKey="collections" hiddenCount={hiddenCount} shown={moreShown} />
      )}
      {!inbox && collections.length === 0 && (
        <SidebarCreateRow label="New collection" onCreate={onCreate} />
      )}
    </CollapsibleSidebarGroup>
  );
}

// Not reorderable: the server keeps shared-group rows alphabetical.
function SharedCollectionsGroup({
  section,
  activeId,
  dragSourceCollectionId,
  isReorderActive,
  onCreate,
}: {
  section: SharedGroupSection;
  activeId?: string;
  dragSourceCollectionId?: string;
  isReorderActive: boolean;
  onCreate: () => void;
}) {
  const foldKey: SidebarGroupKey = `shared:${section.groupId}`;
  const moreShown = useSidebarFoldStore((state) => state.byKey[moreKey(foldKey)] ?? false);
  const { rows, hiddenCount, hasHidden } = splitSidebarRows(section.collections, {
    expanded: moreShown,
    activeId,
  });

  return (
    <CollapsibleSidebarGroup
      label={section.groupName}
      foldKey={foldKey}
      createLabel="New shared collection"
      onCreate={onCreate}
    >
      {rows.map((col) => (
        <CollectionRowMenu key={col.id} collection={col} isActive={activeId === col.id}>
          <DroppableCollection
            collectionId={col.id}
            disabled={col.id === dragSourceCollectionId || isReorderActive}
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeId === col.id}
                // col.homeDecks can include decks linked to a group binder even though group binders aren't selectable as a deck box.
                title={deckBoxLabel(col.homeDecks)}
                render={
                  <Link
                    to="/collections/$collectionId"
                    params={{ collectionId: col.id }}
                    search={(prev) => prev}
                  />
                }
              >
                {col.homeDecks.length > 0 ? <BoxIcon /> : <BookOpenIcon />}
                <span className="flex-1 truncate">{col.name}</span>
                {col.copyCount > 0 && (
                  <Badge variant="ghost" className="text-2xs ml-auto">
                    {col.copyCount}
                  </Badge>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </DroppableCollection>
        </CollectionRowMenu>
      ))}
      {(hiddenCount > 0 || (moreShown && hasHidden)) && (
        <SidebarShowMoreRow foldKey={foldKey} hiddenCount={hiddenCount} shown={moreShown} />
      )}
      {section.collections.length === 0 && (
        <SidebarCreateRow label="New shared collection" onCreate={onCreate} />
      )}
    </CollapsibleSidebarGroup>
  );
}

// Must live as a child of the route-level DndContext so useDndMonitor sees
// the same events the route does; non-reorder drags are left to it.
function SidebarReorderMonitor({
  personalSortableIds,
  listIdsByIntent,
}: {
  personalSortableIds: string[];
  listIdsByIntent: Map<ListIntent, string[]>;
}) {
  const reorderCollections = useReorderCollections();
  const reorderLists = useReorderLists();

  useDndMonitor({
    onDragEnd: (event: DragEndEvent) => {
      const dragData = asDragData<AnyDragData>(event.active.data.current, COLLECTION_DRAG_TYPES);
      if (!dragData) {
        return;
      }
      if (dragData.type === "sidebar-reorder-collection") {
        handleCollectionReorder(event, dragData);
        return;
      }
      if (dragData.type === "sidebar-reorder-list") {
        handleListReorder(event, dragData);
      }
    },
  });

  function handleCollectionReorder(
    event: DragEndEvent,
    dragData: SidebarReorderCollectionDragData,
  ) {
    const overId = event.over?.id;
    if (typeof overId !== "string" || overId === event.active.id) {
      return;
    }
    const overCollectionId = overId.startsWith(SORTABLE_COLLECTION_PREFIX)
      ? overId.slice(SORTABLE_COLLECTION_PREFIX.length)
      : null;
    if (!overCollectionId) {
      return;
    }
    const oldIndex = personalSortableIds.indexOf(dragData.collectionId);
    const newIndex = personalSortableIds.indexOf(overCollectionId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return;
    }
    const orderedIds = [...personalSortableIds];
    orderedIds.splice(oldIndex, 1);
    orderedIds.splice(newIndex, 0, dragData.collectionId);
    reorderCollections.mutate({ orderedIds });
  }

  function handleListReorder(event: DragEndEvent, dragData: SidebarReorderListDragData) {
    const overId = event.over?.id;
    if (typeof overId !== "string" || overId === event.active.id) {
      return;
    }
    const overListId = overId.startsWith(SORTABLE_LIST_PREFIX)
      ? overId.slice(SORTABLE_LIST_PREFIX.length)
      : null;
    if (!overListId) {
      return;
    }
    const bucket = listIdsByIntent.get(dragData.intent) ?? [];
    const oldIndex = bucket.indexOf(dragData.listId);
    const newIndex = bucket.indexOf(overListId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return;
    }
    const orderedIds = [...bucket];
    orderedIds.splice(oldIndex, 1);
    orderedIds.splice(newIndex, 0, dragData.listId);
    reorderLists.mutate({ intent: dragData.intent, orderedIds });
  }

  return null;
}

export function CollectionSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;
  const { collectionId, listId } = useParams({ strict: false }) as {
    collectionId?: string;
    listId?: string;
  };
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: collections } = useCollections();
  const { data: lists } = useLists();

  // Any navigation closes the mobile sidebar, so the route is the scope.
  useScopeEffect(`${currentPath} ${collectionId ?? ""} ${listId ?? ""}`, () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  });

  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [createInGroup, setCreateInGroup] = useState<{ slug: string; name: string } | null>(null);

  const { active } = useDndContext();
  const isReorderActive =
    asDragData<AnyDragData>(active?.data.current, SIDEBAR_REORDER_DRAG_TYPES) !== undefined;
  const dragSourceCollectionId = asDragData<CardDragData>(active?.data.current, [
    "collection-card",
  ])?.sourceCollectionId;

  const { personal, groups } = partitionCollections(collections ?? []);
  const totalCopies = personal.reduce((sum, col) => sum + col.copyCount, 0);

  // Inbox is pinned at the top of the personal section (`isInbox DESC` in the
  // server query) — reorder applies to non-inbox personal collections only.
  const personalNonInbox = personal.filter((col) => !col.isInbox);
  const inbox = personal.find((col) => col.isInbox);
  const personalSortableIds = personalNonInbox.map((col) => col.id);

  const listIdsByIntent = new Map<ListIntent, string[]>();
  for (const intent of ["wish", "trade", "organize"] as const) {
    listIdsByIntent.set(
      intent,
      lists.filter((list: ListResponse) => list.intent === intent).map((list) => list.id),
    );
  }

  return (
    <NestedSidebar className="ml-safe">
      <MobileSidebarHeader />
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={currentPath === "/collections/" && !collectionId}
              render={<Link to="/collections" search={(prev) => prev} />}
            >
              <LayersIcon />
              <span className="flex-1">All Cards</span>
              {totalCopies > 0 && (
                <Badge variant="ghost" className="text-2xs ml-auto">
                  {totalCopies}
                </Badge>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <PersonalCollectionsGroup
          inbox={inbox}
          collections={personalNonInbox}
          activeId={collectionId}
          dragSourceCollectionId={dragSourceCollectionId}
          isReorderActive={isReorderActive}
          onCreate={() => {
            setCreateInGroup(null);
            setCreateCollectionOpen(true);
          }}
        />
        {groups.map((section) => (
          <SharedCollectionsGroup
            key={section.groupId}
            section={section}
            activeId={collectionId}
            dragSourceCollectionId={dragSourceCollectionId}
            isReorderActive={isReorderActive}
            onCreate={() => {
              setCreateInGroup({ slug: section.groupSlug, name: section.groupName });
              setCreateCollectionOpen(true);
            }}
          />
        ))}
        <ListsSidebarGroups activeId={listId} isReorderActive={isReorderActive} />
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentPath === "/collections/stats"}
                render={<Link to="/collections/stats" />}
              >
                <ChartBarIcon />
                <span>Statistics</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentPath === "/collections/import"}
                render={<Link to="/collections/import" />}
              >
                <ArrowLeftRightIcon />
                <span>Import / Export</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentPath === "/collections/activity"}
                render={<Link to="/collections/activity" />}
              >
                <HistoryIcon />
                <span>Activity</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <CreateCollectionDialog
        open={createCollectionOpen}
        onOpenChange={setCreateCollectionOpen}
        groupSlug={createInGroup?.slug}
        groupName={createInGroup?.name}
      />
      <SidebarReorderMonitor
        personalSortableIds={personalSortableIds}
        listIdsByIntent={listIdsByIntent}
      />
    </NestedSidebar>
  );
}
