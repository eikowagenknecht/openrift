import { useDndContext } from "@dnd-kit/core";
import { Link, useMatches, useParams } from "@tanstack/react-router";
import {
  BookOpenIcon,
  HistoryIcon,
  ArrowLeftRightIcon,
  InboxIcon,
  LayersIcon,
  PlusIcon,
  StoreIcon,
  XIcon,
} from "lucide-react";
import { parseAsBoolean, useQueryState } from "nuqs";
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

export function CollectionSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;
  const { collectionId } = useParams({ strict: false }) as { collectionId?: string };
  const [browsing] = useQueryState("browsing", parseAsBoolean.withDefault(false));
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: collections } = useCollections();

  // Close the mobile sidebar when the user navigates to a different page
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [currentPath, collectionId, isMobile, setOpenMobile]);
  const createCollection = useCreateCollection();
  const sourcesEnabled = useFeatureEnabled("acquisition-sources");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { active } = useDndContext();
  const dragSourceCollectionId = (active?.data.current as CardDragData | undefined)
    ?.sourceCollectionId;

  const totalCopies = collections?.reduce((sum, col) => sum + col.copyCount, 0) ?? 0;

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    createCollection.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setNewName("");
          setIsCreating(false);
        },
      },
    );
  };

  return (
    <NestedSidebar>
      <MobileSidebarHeader />
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={currentPath === "/collections/" && !collectionId}
              render={<Link to="/collections" />}
              size="sm"
            >
              <LayersIcon />
              <span className="flex-1">All Cards</span>
              {totalCopies > 0 && (
                <Badge variant="ghost" className="ml-auto text-[10px]">
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
                      <Link to="/collections/$collectionId" params={{ collectionId: col.id }} />
                    }
                    size="sm"
                  >
                    {col.isInbox ? <InboxIcon /> : <BookOpenIcon />}
                    <span className="flex-1 truncate">{col.name}</span>
                    {browsing && collectionId === col.id ? (
                      <span className="ml-auto size-2.5 animate-pulse rounded-full bg-red-500" />
                    ) : (
                      col.copyCount > 0 && (
                        <Badge
                          variant={col.isInbox ? "default" : "ghost"}
                          className="ml-auto text-[10px]"
                        >
                          {col.copyCount}
                        </Badge>
                      )
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </DroppableCollection>
            ))}
            <SidebarMenuItem>
              {isCreating ? (
                <form
                  className="flex gap-1 px-2 py-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreate();
                  }}
                >
                  <Input
                    autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional for inline create
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="Collection name"
                    className="h-7 text-xs" // TODO: Style this better, the current style does not fit here
                    onBlur={() => {
                      if (!newName.trim()) {
                        setIsCreating(false);
                      }
                    }}
                  />
                </form>
              ) : (
                <SidebarMenuButton
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setIsCreating(true)}
                >
                  <PlusIcon className="size-4" />
                  <span>New collection</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentPath === "/collections/import"}
                render={<Link to="/collections/import" />}
                size="sm"
              >
                <ArrowLeftRightIcon />
                <span>Import / Export</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentPath === "/collections/activity"}
                render={<Link to="/collections/activity" />}
                size="sm"
              >
                <HistoryIcon />
                <span>Activity</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {sourcesEnabled && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={currentPath === "/collections/sources"}
                  render={<Link to="/collections/sources" />}
                  size="sm"
                >
                  <StoreIcon />
                  <span>Sources</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </NestedSidebar>
  );
}
