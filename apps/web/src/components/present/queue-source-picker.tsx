import type { ListIntent } from "@openrift/shared/types/api/list";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LayersIcon, ListIcon, Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandEmpty } from "@/components/ui/command";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCards } from "@/hooks/use-cards";
import { deckDetailQueryOptions, decksQueryOptions } from "@/hooks/use-decks";
import { listDetailQueryOptions, listsQueryOptions } from "@/hooks/use-lists";
import { useUserId } from "@/lib/auth-session";
import { deckPrintingIds, listPrintingIds } from "@/lib/present-queue-sources";

const INTENT_LABEL: Record<ListIntent, string> = {
  wish: "Wishlist",
  trade: "Tradelist",
  organize: "Organize",
};

export interface QueueSource {
  label: string;
  printingIds: string[];
}

function SourcePopover({
  label,
  icon,
  open,
  onOpenChange,
  searchPlaceholder,
  children,
}: {
  label: string;
  icon: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchPlaceholder: string;
  children: ReactNode;
}) {
  const [highlightedId, setHighlightedId] = useState("");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            {icon}
            {label}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <PickerList
          searchPlaceholder={searchPlaceholder}
          highlightedId={highlightedId}
          onHighlightChange={setHighlightedId}
        >
          {children}
        </PickerList>
      </PopoverContent>
    </Popover>
  );
}

function SourceRow({
  id,
  name,
  detail,
  busy,
  onSelect,
}: {
  id: string;
  name: string;
  detail?: string;
  busy: boolean;
  onSelect: () => void;
}) {
  return (
    <PickerRow value={id} keywords={[name]} onSelect={onSelect}>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {busy ? (
        <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
      ) : (
        detail !== undefined && (
          <span className="text-muted-foreground shrink-0 text-sm">{detail}</span>
        )
      )}
    </PickerRow>
  );
}

async function loadDeckCards(queryClient: QueryClient, userId: string, deckId: string) {
  try {
    const detail = await queryClient.query({
      ...deckDetailQueryOptions(userId, deckId),
      staleTime: "static",
    });
    return detail.cards;
  } catch {
    toast.error("Couldn't load that deck.");
    return [];
  }
}

async function loadListEntries(queryClient: QueryClient, userId: string, listId: string) {
  try {
    const detail = await queryClient.query({
      ...listDetailQueryOptions(userId, listId),
      staleTime: "static",
    });
    return detail.entries;
  } catch {
    toast.error("Couldn't load that list.");
    return [];
  }
}

/** No "whole set" source: it would truncate the queue in catalog order. Use the browser filter instead. */
export function QueueSourcePicker({ onAdd }: { onAdd: (source: QueueSource) => void }) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const { printingsById, printingsByCardId } = useCards();
  const [openSource, setOpenSource] = useState<"deck" | "list" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const decks = useQuery({
    ...decksQueryOptions(userId ?? ""),
    enabled: userId !== null && openSource === "deck",
  });
  const lists = useQuery({
    ...listsQueryOptions(userId ?? ""),
    enabled: userId !== null && openSource === "list",
  });

  const pickDeck = async (deckId: string, name: string) => {
    setBusyId(deckId);
    const cards = await loadDeckCards(queryClient, userId ?? "", deckId);
    onAdd({ label: name, printingIds: deckPrintingIds(cards, printingsByCardId, printingsById) });
    setBusyId(null);
    setOpenSource(null);
  };

  const pickList = async (listId: string, name: string) => {
    setBusyId(listId);
    const entries = await loadListEntries(queryClient, userId ?? "", listId);
    onAdd({ label: name, printingIds: listPrintingIds(entries, printingsByCardId, printingsById) });
    setBusyId(null);
    setOpenSource(null);
  };

  if (userId === null) {
    return (
      <p className="text-muted-foreground text-sm">
        <Link
          to="/login"
          search={{ redirect: "/stage", email: undefined }}
          className="underline underline-offset-2"
        >
          Sign in
        </Link>{" "}
        to fill the queue from one of your organize lists or decks in one go.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">Fill from</span>

      <SourcePopover
        label="a list"
        icon={<ListIcon className="size-4" />}
        open={openSource === "list"}
        onOpenChange={(open) => setOpenSource(open ? "list" : null)}
        searchPlaceholder="Search your lists…"
      >
        <CommandEmpty>{lists.isPending ? "Loading lists…" : "No lists yet."}</CommandEmpty>
        {(lists.data ?? []).map((list) => (
          <SourceRow
            key={list.id}
            id={list.id}
            name={list.name}
            detail={INTENT_LABEL[list.intent]}
            busy={busyId === list.id}
            onSelect={() => void pickList(list.id, list.name)}
          />
        ))}
      </SourcePopover>

      <SourcePopover
        label="a deck"
        icon={<LayersIcon className="size-4" />}
        open={openSource === "deck"}
        onOpenChange={(open) => setOpenSource(open ? "deck" : null)}
        searchPlaceholder="Search your decks…"
      >
        <CommandEmpty>{decks.isPending ? "Loading decks…" : "No decks yet."}</CommandEmpty>
        {(decks.data ?? [])
          .filter((item) => item.deck.archivedAt === null)
          .map(({ deck }) => (
            <SourceRow
              key={deck.id}
              id={deck.id}
              name={deck.name}
              busy={busyId === deck.id}
              onSelect={() => void pickDeck(deck.id, deck.name)}
            />
          ))}
      </SourcePopover>
    </div>
  );
}
