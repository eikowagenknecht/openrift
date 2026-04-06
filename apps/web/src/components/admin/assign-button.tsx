import { LinkIcon, XIcon } from "lucide-react";
import { useState } from "react";

import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import { Button } from "@/components/ui/button";
import type { useLinkCard } from "@/hooks/use-admin-card-mutations";
import { useDebounce } from "@/hooks/use-debounce";

export function AssignButton({
  normalizedName,
  allCards,
  linkCard,
}: {
  normalizedName: string;
  allCards: { id: string; slug: string; name: string; type: string }[];
  linkCard: ReturnType<typeof useLinkCard>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 150);

  const results: CardSearchResult[] =
    debouncedSearch.length >= 2
      ? allCards
          .filter((card) => card.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
          .slice(0, 20)
          .map((card) => ({
            id: card.id,
            label: card.name,
            sublabel: card.slug,
            detail: card.type,
          }))
      : [];

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="ml-2 h-5 text-xs"
        onClick={() => setOpen(true)}
      >
        <LinkIcon className="size-3" />
        Assign
      </Button>
    );
  }

  return (
    <>
      <CardSearchDropdown
        results={results}
        onSearch={setSearch}
        onSelect={(cardId) => {
          linkCard.mutate({ name: normalizedName, cardId });
          setOpen(false);
          setSearch("");
        }}
        placeholder="Search by name…"
        className="ml-2 inline-flex w-48 [&_input]:h-5 [&_input]:py-0 [&_input]:text-xs"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, autofocus is intentional
        autoFocus
      />
      <Button
        variant="ghost"
        size="sm"
        className="ml-1 h-5 text-xs"
        aria-label="Close search"
        onClick={() => {
          setOpen(false);
          setSearch("");
        }}
      >
        <XIcon className="size-3" />
      </Button>
    </>
  );
}
