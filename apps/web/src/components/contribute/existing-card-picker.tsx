import { useDebouncedValue } from "@tanstack/react-pacer";
import { SearchIcon, XIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCards } from "@/hooks/use-cards";
import { useCatalogCardSearch } from "@/hooks/use-catalog-card-search";
import type { ContributeFormState } from "@/lib/contribute-json";
import { prefillFromCard } from "@/lib/contribute-json";

/**
 * Lets a contributor start from a card OpenRift already has instead of an empty
 * form: pick it, and every field plus all its printings are filled in, so a new
 * variant is a copied printing with two edits rather than a page of retyping.
 *
 * The trigger swaps to the shared {@link CardSearchDropdown} inline, matching
 * the admin pickers. The catalog behind the search is the app's largest
 * payload, so the searching half mounts only once the trigger is used and
 * suspends on its own rather than holding up the form.
 *
 * @param props.onPick Receives form state prefilled from the chosen card.
 * @returns The trigger button, or the card search once it is open.
 */
export function ExistingCardPicker({
  onPick,
}: {
  onPick: (prefilled: ContributeFormState) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <SearchIcon className="size-4" />
        Select an existing card
      </Button>
    );
  }

  const handlePick = (prefilled: ContributeFormState) => {
    setOpen(false);
    onPick(prefilled);
  };

  return (
    <span className="inline-flex items-center">
      <Suspense fallback={<Input className="w-56" placeholder="Loading cards…" disabled />}>
        <CatalogSearch onPick={handlePick} />
      </Suspense>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-1"
        aria-label="Close card search"
        onClick={() => setOpen(false)}
      >
        <XIcon className="size-4" />
      </Button>
    </span>
  );
}

/**
 * The half of the picker that needs the catalog. Split out so `useCards`
 * suspends inside the boundary above instead of on first render of the form.
 * @param props.onPick Receives form state prefilled from the chosen card.
 * @returns The card search autocomplete.
 */
function CatalogSearch({ onPick }: { onPick: (prefilled: ContributeFormState) => void }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, { wait: 150 });
  const results = useCatalogCardSearch(debouncedSearch);
  const { cardsById, printingsByCardId, sets } = useCards();

  const handleSelect = (cardId: string) => {
    const card = cardsById[cardId];
    if (!card) {
      return;
    }
    const setSlugById = new Map(sets.map((set) => [set.id, set.slug]));
    const setNameById = new Map(sets.map((set) => [set.id, set.name]));
    onPick(prefillFromCard(card, printingsByCardId.get(cardId) ?? [], setSlugById, setNameById));
  };

  return (
    <CardSearchDropdown
      results={results}
      onSearch={setSearch}
      onSelect={handleSelect}
      placeholder="Search by name or code…"
      className="w-56"
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- the trigger button just swapped itself for this input
      autoFocus
    />
  );
}
