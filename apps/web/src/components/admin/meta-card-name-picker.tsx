import { LinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardPickerButton } from "@/components/cards/card-picker-button";
import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { cardSearchLeading } from "@/components/cards/printing-option-content";
import { useResolveMetaOverlayName } from "@/hooks/use-admin-meta-overlays";
import { useCatalogCardSearch } from "@/hooks/use-catalog-card-search";

// The pick is stored as a name alias, so every future upload from any provider
// matches it without asking again; rematching runs immediately for other staged decks.
export function MetaCardNamePicker({ name }: { name: string }) {
  const resolveName = useResolveMetaOverlayName();
  const [search, setSearch] = useState("");
  const results = useCatalogCardSearch(search, undefined, cardSearchLeading);

  async function handlePick(cardId: string) {
    const cardName = results.find((result) => result.id === cardId)?.label ?? "that card";
    setSearch("");
    let resolved = 0;
    try {
      const result = await resolveName.mutateAsync({ name, cardId });
      resolved = result.updated;
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`"${name}" now means ${cardName}`, {
      description: `${resolved} staged card ${resolved === 1 ? "row" : "rows"} resolved.`,
    });
  }

  return (
    <CardPickerButton
      label="Link card"
      icon={<LinkIcon />}
      size="xs"
      disabled={resolveName.isPending}
    >
      {({ close }) => (
        <CardSearchDropdown
          results={results}
          onSearch={setSearch}
          onSelect={(cardId) => {
            close();
            void handlePick(cardId);
          }}
          placeholder="Search the catalog…"
          className="w-56"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, the trigger just swapped to this input
          autoFocus
        />
      )}
    </CardPickerButton>
  );
}
