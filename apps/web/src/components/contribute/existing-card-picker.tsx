import { SearchIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardPickerButton } from "@/components/cards/card-picker-button";
import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { cardSearchLeading } from "@/components/cards/printing-option-content";
import { Input } from "@/components/ui/input";
import { useCards } from "@/hooks/use-cards";
import { useCatalogCardSearch } from "@/hooks/use-catalog-card-search";
import type { ContributeFormState } from "@/lib/contribute-json";
import { prefillFromCard } from "@/lib/contribute-json";

export function ExistingCardPicker({
  onPick,
}: {
  onPick: (prefilled: ContributeFormState) => void;
}) {
  return (
    <CardPickerButton
      type="button"
      variant="ghost"
      size="sm"
      label="Select an existing card"
      icon={<SearchIcon className="size-4" />}
      closeLabel="Close card search"
    >
      {({ close }) => (
        <Suspense fallback={<Input className="w-56" placeholder="Loading cards…" disabled />}>
          <CatalogSearch
            onPick={(prefilled) => {
              close();
              onPick(prefilled);
            }}
          />
        </Suspense>
      )}
    </CardPickerButton>
  );
}

// Split out so useCards suspends inside the boundary above, not on the form's first render.
function CatalogSearch({ onPick }: { onPick: (prefilled: ContributeFormState) => void }) {
  const [search, setSearch] = useState("");
  const results = useCatalogCardSearch(search, undefined, cardSearchLeading);
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
