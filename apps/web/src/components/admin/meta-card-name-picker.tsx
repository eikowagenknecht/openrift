import { useDebouncedValue } from "@tanstack/react-pacer";
import { LinkIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { Button } from "@/components/ui/button";
import { useResolveMetaCandidateName } from "@/hooks/use-admin-meta-candidates";
import { useCatalogCardSearch } from "@/hooks/use-catalog-card-search";

/**
 * The fix for one unresolved card name (ADR-014): pick the card the source
 * meant, and the pick is stored as a name alias, so every future upload from
 * any provider matches it without asking again. Rematching runs immediately, so
 * the same name in other staged decks resolves in the same click.
 *
 * Same interaction as the card pipeline's AssignButton: the trigger swaps to
 * the shared {@link CardSearchDropdown} autocomplete inline.
 *
 * @returns The "Link card" trigger and its card picker.
 */
export function MetaCardNamePicker({ name }: { name: string }) {
  const resolveName = useResolveMetaCandidateName();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, { wait: 150 });
  const results = useCatalogCardSearch(debouncedSearch);

  async function handlePick(cardId: string) {
    const cardName = results.find((result) => result.id === cardId)?.label ?? "that card";
    setOpen(false);
    setSearch("");
    let resolved = 0;
    try {
      const result = await resolveName.mutateAsync({ name, cardId });
      resolved = result.resolved;
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`"${name}" now means ${cardName}`, {
      description: `${resolved} staged card ${resolved === 1 ? "row" : "rows"} resolved.`,
    });
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="xs"
        disabled={resolveName.isPending}
        onClick={() => setOpen(true)}
      >
        <LinkIcon />
        Link card
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center">
      <CardSearchDropdown
        results={results}
        onSearch={setSearch}
        onSelect={(cardId) => void handlePick(cardId)}
        placeholder="Search the catalog…"
        className="w-56"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, the trigger just swapped to this input
        autoFocus
      />
      <Button
        variant="ghost"
        size="xs"
        className="ml-1"
        aria-label="Close search"
        onClick={() => {
          setOpen(false);
          setSearch("");
        }}
      >
        <XIcon />
      </Button>
    </span>
  );
}
