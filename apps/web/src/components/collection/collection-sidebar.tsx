import { Link, useMatches, useParams } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  HistoryIcon,
  ImportIcon,
  InboxIcon,
  LayersIcon,
  PlusIcon,
  StoreIcon,
} from "lucide-react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NestedSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useCollections, useCreateCollection } from "@/hooks/use-collections";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";

export function CollectionSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;
  const { collectionId } = useParams({ strict: false }) as { collectionId?: string };
  const [browsing] = useQueryState("browsing", parseAsBoolean.withDefault(false));
  const { data: collections } = useCollections();
  const createCollection = useCreateCollection();
  const sourcesEnabled = useFeatureEnabled("acquisition-sources");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

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
              <SidebarMenuItem key={col.id}>
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground w-full justify-start gap-2"
                  onClick={() => setIsCreating(true)}
                >
                  <PlusIcon className="size-4" />
                  New collection
                </Button>
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
                <ImportIcon />
                <span>Import</span>
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
      <SidebarFooter>
        <SidebarSeparator className="mx-0" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/cards" />}>
              <ArrowLeftIcon />
              <span>Browse cards</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </NestedSidebar>
  );
}
