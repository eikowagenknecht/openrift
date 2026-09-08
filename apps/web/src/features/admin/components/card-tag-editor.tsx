import type { CustomTagResponse } from "@openrift/shared/types/api/admin";
import { useState } from "react";

import {
  SectionHeader,
  SectionHeaderDescription,
  SectionHeaderGroup,
  SectionHeaderTitle,
} from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { CategorySelectOptions } from "@/features/admin/components/admin-crud-shared";
import { useAllCards } from "@/features/admin/hooks/use-admin-card-queries";
import { CardSearchDropdown } from "@/features/cards/components/card-search-dropdown";
import { useAdminCardSearch } from "@/features/cards/hooks/use-card-search";
import {
  useCardCustomTags,
  useSetCardCustomTags,
} from "@/features/collections/hooks/use-custom-tags";

export function CategorySelect({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next);
        }
      }}
    >
      <SelectTrigger className="h-8 w-40" aria-label="Category">
        <SelectValue />
      </SelectTrigger>
      <CategorySelectOptions items={items} />
    </Select>
  );
}

export function CardTagEditor({ tags }: { tags: CustomTagResponse[] }) {
  const { data: allCards } = useAllCards();
  const [search, setSearch] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const searchResults = useAdminCardSearch(allCards, search);

  const selectedCard = selectedCardId ? allCards.find((c) => c.id === selectedCardId) : undefined;

  return (
    <section className="space-y-4 rounded-md border p-4">
      <SectionHeader>
        <SectionHeaderGroup>
          <SectionHeaderTitle as="h3">Assign tags to a card</SectionHeaderTitle>
          <SectionHeaderDescription>
            Search for a card, then toggle which custom tags it carries.
          </SectionHeaderDescription>
        </SectionHeaderGroup>
      </SectionHeader>

      <div className="space-y-1">
        <Label>Card</Label>
        <CardSearchDropdown
          results={searchResults}
          onSearch={setSearch}
          // Raw keystrokes, not the debounced query: a pick also fills the input
          // and fires this, so only drop the selection once the text diverges.
          onRawInputChange={(value) => {
            setSelectedCardId((prev) =>
              prev !== null && allCards.find((c) => c.id === prev)?.name === value ? prev : null,
            );
          }}
          onSelect={(id) => setSelectedCardId(id)}
          placeholder="Search by name…"
          className="w-80"
        />
      </div>

      {selectedCard ? (
        <CardTagToggleList
          key={selectedCard.id}
          cardId={selectedCard.id}
          cardName={selectedCard.name}
          tags={tags}
        />
      ) : (
        <p className="text-muted-foreground text-sm">No card selected.</p>
      )}
    </section>
  );
}

function CardTagToggleList({
  cardId,
  cardName,
  tags,
}: {
  cardId: string;
  cardName: string;
  tags: CustomTagResponse[];
}) {
  const { data } = useCardCustomTags(cardId);
  const mutation = useSetCardCustomTags(cardId);
  const [pending, setPending] = useState<Set<string>>(new Set(data.customTagIds));

  function toggle(tagId: string) {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }

  async function save() {
    try {
      await mutation.mutateAsync([...pending]);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  const dirty =
    pending.size !== data.customTagIds.length ||
    [...pending].some((id) => !data.customTagIds.includes(id));

  const tagsByCategory = Map.groupBy(tags, (t) => t.categoryLabel);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{cardName}</p>
      {[...tagsByCategory.entries()].map(([categoryLabel, group]) => (
        <div key={categoryLabel} className="space-y-1">
          <p className="text-muted-foreground font-mono text-xs uppercase">{categoryLabel}</p>
          <div className="flex flex-wrap gap-2">
            {group.map((tag) => {
              const active = pending.has(tag.id);
              return (
                <Toggle
                  key={tag.id}
                  variant="outline"
                  pressed={active}
                  onPressedChange={() => toggle(tag.id)}
                  className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground rounded-full px-3"
                >
                  {tag.label}
                </Toggle>
              );
            })}
          </div>
        </div>
      ))}
      {tags.length === 0 && (
        <p className="text-muted-foreground text-sm">No tags exist yet — create one above.</p>
      )}
      <Button disabled={!dirty || mutation.isPending} onClick={() => void save()}>
        {mutation.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
