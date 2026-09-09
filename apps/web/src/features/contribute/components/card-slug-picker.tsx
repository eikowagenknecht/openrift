import { SearchIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { Input } from "@/components/ui/input";
import { CardPickerButton } from "@/features/cards/components/card-picker-button";
import { CardSearchDropdown } from "@/features/cards/components/card-search-dropdown";
import { cardSearchLeading } from "@/features/cards/components/printing-option-content";
import { useCards } from "@/features/cards/hooks/use-cards";
import { useCatalogCardSearch } from "@/features/cards/hooks/use-catalog-card-search";

export function CardSlugPicker({
  onPick,
  label = "Search for a card",
}: {
  onPick: (cardSlug: string) => void;
  label?: string;
}) {
  return (
    <CardPickerButton
      type="button"
      variant="outline"
      size="sm"
      label={label}
      icon={<SearchIcon className="size-4" />}
      closeLabel="Close card search"
    >
      {({ close }) => (
        <Suspense fallback={<Input className="w-56" placeholder="Loading cards…" disabled />}>
          <CatalogSearch
            onPick={(cardSlug) => {
              close();
              onPick(cardSlug);
            }}
          />
        </Suspense>
      )}
    </CardPickerButton>
  );
}

// Split out so useCards suspends inside the boundary above, not on the page's first render.
function CatalogSearch({ onPick }: { onPick: (cardSlug: string) => void }) {
  const [search, setSearch] = useState("");
  const results = useCatalogCardSearch(search, undefined, cardSearchLeading);
  const { cardsById } = useCards();

  const handleSelect = (cardId: string) => {
    const card = cardsById[cardId];
    if (!card) {
      return;
    }
    onPick(card.slug);
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
