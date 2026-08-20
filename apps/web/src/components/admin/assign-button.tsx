import { LinkIcon } from "lucide-react";
import { useState } from "react";

import { CardPickerButton } from "@/components/cards/card-picker-button";
import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import type { useLinkCard } from "@/hooks/use-admin-card-mutations";
import type { AdminSearchableCard } from "@/hooks/use-card-search";
import { useAdminCardSearch } from "@/hooks/use-card-search";

/**
 * Links an unmatched normalized card name to an existing card.
 * @returns The "Assign" trigger and its card picker.
 */
export function AssignButton({
  normalizedName,
  allCards,
  linkCard,
}: {
  normalizedName: string;
  allCards: AdminSearchableCard[];
  linkCard: ReturnType<typeof useLinkCard>;
}) {
  const [search, setSearch] = useState("");
  const results = useAdminCardSearch(allCards, search);

  return (
    <CardPickerButton label="Assign" icon={<LinkIcon className="size-3" />} className="ml-2">
      {({ close }) => (
        <CardSearchDropdown
          results={results}
          onSearch={setSearch}
          onSelect={(cardId) => {
            linkCard.mutate({ name: normalizedName, cardId });
            setSearch("");
            close();
          }}
          placeholder="Search by name…"
          className="w-48"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, autofocus is intentional
          autoFocus
        />
      )}
    </CardPickerButton>
  );
}
