import { LinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardPickerButton } from "@/components/cards/card-picker-button";
import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { useResolveMetaCandidateName } from "@/hooks/use-admin-meta-candidates";
import { useCatalogCardSearch } from "@/hooks/use-catalog-card-search";

/**
 * The fix for one unresolved card name (ADR-014): pick the card the source
 * meant, and the pick is stored as a name alias, so every future upload from
 * any provider matches it without asking again. Rematching runs immediately, so
 * the same name in other staged decks resolves in the same click.
 *
 * Same interaction as the card pipeline's AssignButton, and now literally the
 * same component: {@link CardPickerButton} owns the trigger-swaps-to-search
 * behavior both share.
 *
 * @returns The "Link card" trigger and its card picker.
 */
export function MetaCardNamePicker({ name }: { name: string }) {
  const resolveName = useResolveMetaCandidateName();
  const [search, setSearch] = useState("");
  const results = useCatalogCardSearch(search);

  async function handlePick(cardId: string) {
    const cardName = results.find((result) => result.id === cardId)?.label ?? "that card";
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
