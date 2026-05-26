import { useDndContext } from "@dnd-kit/core";
import type { ListIntent } from "@openrift/shared";
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
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CreateListDialog, listKindIcon } from "@/components/list/create-list-dialog";
import { DroppableSidebarList } from "@/components/list/droppable-sidebar-list";
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
import { useCollections } from "@/hooks/use-collections";
import { useLists } from "@/hooks/use-lists";
import type { SidebarGroupKey } from "@/stores/sidebar-fold-store";
import { useSidebarFoldStore } from "@/stores/sidebar-fold-store";

import { CreateCollectionDialog } from "./create-collection-dialog";
import type { CardDragData } from "./dnd-types";
import { DroppableCollection } from "./droppable-collection";

function MobileSidebarHeader() {
  const { setOpenMobile } = useSidebar();

  return (
    <div className="flex items-center justify-between p-4 md:hidden">
      <h2 className="text-base font-medium">Collections</h2>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpenMobile(false)}>
        <XIcon />
        <span className="sr-only">Close</span>
      </Button>
    </div>
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
  const open = useSidebarFoldStore((state) => state.byKey[foldKey]);
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

function ListsSidebarGroups({ activeId }: { activeId?: string }) {
  const { data: lists } = useLists();
  const [createIntent, setCreateIntent] = useState<ListIntent | null>(null);

  // Group lists by intent so each section only renders its own rows.
  const byIntent = Map.groupBy(lists, (list) => list.intent);

  return (
    <>
      {INTENT_GROUPS.map(({ intent, groupLabel, newButtonLabel, foldKey }) => {
        const rows = byIntent.get(intent) ?? [];
        return (
          <CollapsibleSidebarGroup key={intent} label={groupLabel} foldKey={foldKey}>
            {rows.map((list) => {
              const KindIcon = listKindIcon(list.kind);
              // Every list kind accepts dropped copies — the server derives
              // card / printing / copy entries from the list's kind via the
              // /entries/from-copies endpoint.
              return (
                <DroppableSidebarList key={list.id} listId={list.id} listName={list.name}>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeId === list.id}
                      render={<Link to="/collections/lists/$listId" params={{ listId: list.id }} />}
                    >
                      <KindIcon />
                      <span className="flex-1 truncate">{list.name}</span>
                      {list.entryCount > 0 && (
                        <Badge variant="ghost" className="text-2xs ml-auto">
                          {list.entryCount}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </DroppableSidebarList>
              );
            })}
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

export function CollectionSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;
  const { collectionId, listId } = useParams({ strict: false }) as {
    collectionId?: string;
    listId?: string;
  };
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: collections } = useCollections();

  // Close the mobile sidebar when the user navigates to a different page
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [currentPath, collectionId, listId, isMobile, setOpenMobile]);

  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);

  const { active } = useDndContext();
  const dragSourceCollectionId = (active?.data.current as CardDragData | undefined)
    ?.sourceCollectionId;

  const totalCopies = collections?.reduce((sum, col) => sum + col.copyCount, 0) ?? 0;

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
          {collections?.map((col) => (
            <DroppableCollection
              key={col.id}
              collectionId={col.id}
              disabled={col.id === dragSourceCollectionId}
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
                  {col.isInbox ? <InboxIcon /> : <BookOpenIcon />}
                  <span className="flex-1 truncate">{col.name}</span>
                  {col.copyCount > 0 && (
                    <Badge variant={col.isInbox ? "default" : "ghost"} className="text-2xs ml-auto">
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
              onClick={() => setCreateCollectionOpen(true)}
            >
              <PlusIcon className="size-4" />
              <span>New collection</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </CollapsibleSidebarGroup>
        <ListsSidebarGroups activeId={listId} />
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
      <CreateCollectionDialog open={createCollectionOpen} onOpenChange={setCreateCollectionOpen} />
    </NestedSidebar>
  );
}
