import { Link, useMatches, useParams } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  InboxIcon,
  LayersIcon,
  PlusIcon,
  StoreIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
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
import { useCopies } from "@/hooks/use-copies";

export function CollectionSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;
  const { collectionId } = useParams({ strict: false }) as { collectionId?: string };
  const { data: collections } = useCollections();
  const { data: allCopies } = useCopies();
  const createCollection = useCreateCollection();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const copyCounts = new Map<string, number>();
  if (allCopies) {
    for (const copy of allCopies) {
      copyCounts.set(copy.collection_id, (copyCounts.get(copy.collection_id) ?? 0) + 1);
    }
  }
  const totalCopies = allCopies?.length ?? 0;

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
          toast.success("Collection created");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Sidebar className="sticky! top-14 h-[calc(100svh-3.5rem-1px)]! border-l-0!">
      <SidebarHeader>
        <Link to="/collection" className="px-2 py-1 text-lg font-semibold tracking-tight">
          Collection
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Collections</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentPath === "/collection" && !collectionId}
                render={<Link to="/collection" />}
              >
                <LayersIcon />
                <span className="flex-1">All Cards</span>
                {totalCopies > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {totalCopies}
                  </Badge>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
            {collections?.map((col) => (
              <SidebarMenuItem key={col.id}>
                <SidebarMenuButton
                  isActive={collectionId === col.id}
                  render={<Link to="/collection/$collectionId" params={{ collectionId: col.id }} />}
                >
                  {col.isInbox ? <InboxIcon /> : <BookOpenIcon />}
                  <span className="flex-1 truncate">{col.name}</span>
                  {(copyCounts.get(col.id) ?? 0) > 0 && (
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {copyCounts.get(col.id)}
                    </Badge>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              {isCreating ? (
                <form
                  className="flex gap-1 px-2 py-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreate();
                  }}
                >
                  <Input
                    autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional for inline create
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Collection name"
                    className="h-7 text-xs"
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
                  className="w-full justify-start gap-2 text-muted-foreground"
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
                isActive={currentPath === "/collection/sources"}
                render={<Link to="/collection/sources" />}
              >
                <StoreIcon />
                <span>Sources</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/" />}>
              <ArrowLeftIcon />
              <span>Browse cards</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
