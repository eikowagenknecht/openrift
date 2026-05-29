import { useDndContext, useDndMonitor } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { ListIntent, ListResponse } from "@openrift/shared";
import { Link, useMatches, useParams } from "@tanstack/react-router";
import {
  BookOpenIcon,
  ChartBarIcon,
  ChevronDownIcon,
  HistoryIcon,
  ArrowLeftRightIcon,
  InboxIcon,
  LayersIcon,
  PlusIcon,
  Share2Icon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CreateListDialog, listKindIcon } from "@/components/list/create-list-dialog";
import { DroppableSidebarList } from "@/components/list/droppable-sidebar-list";
import { UserShareDialog } from "@/components/list/user-share-dialog";
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCollections, useReorderCollections } from "@/hooks/use-collections";
import { useLists, useReorderLists } from "@/hooks/use-lists";
import type { SidebarGroupKey } from "@/stores/sidebar-fold-store";
import { useSidebarFoldStore } from "@/stores/sidebar-fold-store";

import { CreateCollectionDialog } from "./create-collection-dialog";
import type {
  AnyDragData,
  CardDragData,
  SidebarReorderCollectionDragData,
  SidebarReorderListDragData,
} from "./dnd-types";
import { DroppableCollection } from "./droppable-collection";
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

/**
 * Sidebar group whose header is a click-to-fold trigger. The open state is
 * persisted per-user via the sidebar-fold store, so refreshing the page
 * keeps the user's collapse choices.
 * @returns A collapsible sidebar group with a chevron-bearing label.
 */
function CollapsibleSidebarGroup({
  label,
  foldKey,
  children,
}: {
  label: string;
  foldKey: SidebarGroupKey;
  children: ReactNode;
}) {
  const open = useSidebarFoldStore((state) => state.byKey[foldKey] ?? true);
  const setOpen = useSidebarFoldStore((state) => state.setOpen);

  return (
    <Collapsible open={open} onOpenChange={(next) => setOpen(foldKey, next)}>
      <SidebarGroup>
        <SidebarGroupLabel
          className="hover:bg-sidebar-accent cursor-pointer transition-colors"
          render={<CollapsibleTrigger />}
        >
          <span className="flex-1 text-left">{label}</span>
          <ChevronDownIcon className="size-3 transition-transform data-[panel-open=false]:-rotate-90" />
        </SidebarGroupLabel>
        <CollapsibleContent className="overflow-hidden transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0">
          <SidebarMenu className="gap-1">{children}</SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
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
  const [shareOpen, setShareOpen] = useState(false);

  const byIntent = Map.groupBy(lists, (list) => list.intent);

  return (
    <>
      {INTENT_GROUPS.map(({ intent, groupLabel, newButtonLabel, foldKey }) => {
        const rows = byIntent.get(intent) ?? [];
        const sortableIds = rows.map((row) => `${SORTABLE_LIST_PREFIX}${row.id}`);
        return (
          <CollapsibleSidebarGroup key={intent} label={groupLabel} foldKey={foldKey}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {rows.map((list) => {
                const KindIcon = listKindIcon(list.kind);
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
                            // Keep the row highlighted while the cursor is over the desktop grip (which overlays the button); max-md:pr-8 reserves room for the mobile grip on the right.
                            className="group-hover/menu-item:bg-sidebar-accent group-hover/menu-item:text-sidebar-accent-foreground max-md:pr-8"
                            render={
                              <Link to="/collections/lists/$listId" params={{ listId: list.id }} />
                            }
                          >
                            <KindIcon className={SIDEBAR_ROW_ICON_CLASS} />
                            <span className="flex-1 truncate">{list.name}</span>
                            {list.entryCount > 0 && (
                              <Badge variant="ghost" className="text-2xs ml-auto">
                                {list.entryCount}
                              </Badge>
                            )}
                          </SidebarMenuButton>
                          {handle}
                        </SidebarMenuItem>
                      </DroppableSidebarList>
                    )}
                  </SortableSidebarRow>
                );
              })}
            </SortableContext>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-muted-foreground"
                onClick={() => setCreateIntent(intent)}
              >
                <PlusIcon className="size-4" />
                <span>{newButtonLabel}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </CollapsibleSidebarGroup>
        );
      })}
      <SidebarGroup>
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton className="text-muted-foreground" onClick={() => setShareOpen(true)}>
              <Share2Icon className="size-4" />
              <span>Share all my lists</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
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
      <UserShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}

interface SharedGroupSection {
  groupId: string;
  groupSlug: string;
  groupName: string;
  collections: ReturnType<typeof useCollections>["data"];
}

/**
 * Partitions collections into the personal section and one section per friend
 * group the viewer belongs to. Groups with at least one shared collection get
 * a section; groups with zero collections are not rendered.
 * @returns The personal collections and the group sections (alphabetised by group name).
 */
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

/**
 * Wires the sidebar's drag-end events to the reorder mutations. Lives as a
 * child of the route-level `DndContext` so `useDndMonitor` sees the same
 * events the route does. Non-reorder drags (card / list-entry) are ignored
 * here — those keep flowing to the route handler.
 * @returns Nothing (invisible helper).
 */
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
      const dragData = event.active.data.current as AnyDragData | undefined;
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

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [currentPath, collectionId, listId, isMobile, setOpenMobile]);

  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [createInGroup, setCreateInGroup] = useState<{ slug: string; name: string } | null>(null);

  const { active } = useDndContext();
  const activeType = active?.data.current?.type;
  const isReorderActive =
    activeType === "sidebar-reorder-collection" || activeType === "sidebar-reorder-list";
  const dragSourceCollectionId = (active?.data.current as CardDragData | undefined)
    ?.sourceCollectionId;

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
    <NestedSidebar className="ml-3" extraOffset="calc(0.75rem + 2rem + 0.75rem)">
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
        <CollapsibleSidebarGroup label="Collections" foldKey="collections">
          {inbox && (
            <DroppableCollection
              key={inbox.id}
              collectionId={inbox.id}
              disabled={inbox.id === dragSourceCollectionId || isReorderActive}
            >
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={collectionId === inbox.id}
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
          )}
          <SortableContext
            items={personalSortableIds.map((id) => `${SORTABLE_COLLECTION_PREFIX}${id}`)}
            strategy={verticalListSortingStrategy}
          >
            {personalNonInbox.map((col) => (
              <SortableSidebarRow
                key={col.id}
                id={`${SORTABLE_COLLECTION_PREFIX}${col.id}`}
                data={{ type: "sidebar-reorder-collection", collectionId: col.id }}
                label={col.name}
              >
                {(handle) => (
                  <DroppableCollection
                    collectionId={col.id}
                    disabled={col.id === dragSourceCollectionId || isReorderActive}
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={collectionId === col.id}
                        // Keep the row highlighted while the cursor is over the desktop grip (which overlays the button); max-md:pr-8 reserves room for the mobile grip on the right.
                        className="group-hover/menu-item:bg-sidebar-accent group-hover/menu-item:text-sidebar-accent-foreground max-md:pr-8"
                        render={
                          <Link
                            to="/collections/$collectionId"
                            params={{ collectionId: col.id }}
                            search={(prev) => prev}
                          />
                        }
                      >
                        <BookOpenIcon className={SIDEBAR_ROW_ICON_CLASS} />
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
                )}
              </SortableSidebarRow>
            ))}
          </SortableContext>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-muted-foreground"
              onClick={() => {
                setCreateInGroup(null);
                setCreateCollectionOpen(true);
              }}
            >
              <PlusIcon className="size-4" />
              <span>New collection</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </CollapsibleSidebarGroup>
        {groups.map((section) => (
          <CollapsibleSidebarGroup
            key={section.groupId}
            label={section.groupName}
            foldKey={`shared:${section.groupId}`}
          >
            {section.collections.map((col) => (
              <DroppableCollection
                key={col.id}
                collectionId={col.id}
                disabled={col.id === dragSourceCollectionId || isReorderActive}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={collectionId === col.id}
                    render={
                      <Link
                        to="/collections/$collectionId"
                        params={{ collectionId: col.id }}
                        search={(prev) => prev}
                      />
                    }
                  >
                    <BookOpenIcon />
                    <span className="flex-1 truncate">{col.name}</span>
                    {col.copyCount > 0 && (
                      <Badge variant="ghost" className="text-2xs ml-auto">
                        {col.copyCount}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </DroppableCollection>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-muted-foreground"
                onClick={() => {
                  setCreateInGroup({ slug: section.groupSlug, name: section.groupName });
                  setCreateCollectionOpen(true);
                }}
              >
                <PlusIcon className="size-4" />
                <span>New shared collection</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </CollapsibleSidebarGroup>
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
