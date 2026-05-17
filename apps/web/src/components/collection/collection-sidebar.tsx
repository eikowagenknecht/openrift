import { useDndContext } from "@dnd-kit/core";
import { Link, useMatches, useParams } from "@tanstack/react-router";
import {
  BookOpenIcon,
  ChartBarIcon,
  HandshakeIcon,
  HistoryIcon,
  ArrowLeftRightIcon,
  InboxIcon,
  LayersIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useCollections, useCreateCollection } from "@/hooks/use-collections";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { useCreateTradeList, useTradeLists } from "@/hooks/use-trade-lists";

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

function InlineCreateRow({
  label,
  placeholder,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || isPending) {
      return;
    }
    setIsPending(true);
    try {
      await onSubmit(trimmed);
      setName("");
      setIsCreating(false);
    } catch {
      // Mutation hooks surface their own error toast; keep the form open so
      // the user can retry without retyping.
    }
    setIsPending(false);
  };

  if (!isCreating) {
    return (
      <SidebarMenuButton className="text-muted-foreground" onClick={() => setIsCreating(true)}>
        <PlusIcon className="size-4" />
        <span>{label}</span>
      </SidebarMenuButton>
    );
  }

  return (
    <form
      className="flex gap-1 px-2 py-1"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <Input
        autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional for inline create
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={placeholder}
        disabled={isPending}
        className="h-7 text-xs" // TODO: Style this better, the current style does not fit here
        onBlur={() => {
          if (!name.trim() && !isPending) {
            setIsCreating(false);
          }
        }}
      />
    </form>
  );
}

function TradeListsSidebarGroup({ activeId }: { activeId?: string }) {
  const { data: tradeLists } = useTradeLists();
  const createTradeList = useCreateTradeList();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Trade Lists</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {tradeLists.map((list) => (
          <SidebarMenuItem key={list.id}>
            <SidebarMenuButton
              isActive={activeId === list.id}
              render={
                <Link
                  to="/collections/trade-lists/$tradeListId"
                  params={{ tradeListId: list.id }}
                />
              }
            >
              <HandshakeIcon />
              <span className="flex-1 truncate">{list.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <InlineCreateRow
            label="New trade list"
            placeholder="Trade list name"
            onSubmit={(name) => createTradeList.mutateAsync({ name })}
          />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function CollectionSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;
  const { collectionId, tradeListId } = useParams({ strict: false }) as {
    collectionId?: string;
    tradeListId?: string;
  };
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: collections } = useCollections();
  const tradeListsEnabled = useFeatureEnabled("trade-lists");

  // Close the mobile sidebar when the user navigates to a different page
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [currentPath, collectionId, tradeListId, isMobile, setOpenMobile]);
  const createCollection = useCreateCollection();

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
        <SidebarGroup>
          <SidebarGroupLabel>Collections</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
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
                      <Badge
                        variant={col.isInbox ? "default" : "ghost"}
                        className="text-2xs ml-auto"
                      >
                        {col.copyCount}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </DroppableCollection>
            ))}
            <SidebarMenuItem>
              <InlineCreateRow
                label="New collection"
                placeholder="Collection name"
                onSubmit={(name) => createCollection.mutateAsync({ name })}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {tradeListsEnabled && <TradeListsSidebarGroup activeId={tradeListId} />}
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
    </NestedSidebar>
  );
}
