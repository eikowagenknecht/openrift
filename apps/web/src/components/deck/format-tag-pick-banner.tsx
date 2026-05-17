import type { DeckResponse } from "@openrift/shared";
import { useState } from "react";

import { TagMultiSelect, useCategoryTagSlugs } from "@/components/deck/format-tag-multi-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useFilterActions } from "@/hooks/use-card-filters";
import { useUpdateDeck } from "@/hooks/use-decks";
import { getFormatTagConfig } from "@/lib/format-tag-config";
import { capitalize } from "@/lib/utils";

/**
 * Shown inside the deck builder when a tag-locked deck format has no tags
 * picked yet. Generic across formats — the noun and tag category come from
 * the per-format config table (see `getFormatTagConfig`). User picks one or
 * more, the banner disappears, and the deck's `format_config.tagSlugs` is
 * persisted via PATCH /decks/{id}.
 *
 * Switching INTO a tag-locked format from the action menu clears
 * `formatConfig` server-side, so existing decks land here too.
 *
 * @returns The banner, or null when the deck's format isn't tag-locked
 *   (defensive: the wrapper {@link needsFormatTagPick} should already gate
 *   this, but we double-check).
 */
export function FormatTagPickBanner({ deck }: { deck: DeckResponse }) {
  const config = getFormatTagConfig(deck.format);
  const availableSlugs = useCategoryTagSlugs(config?.category ?? "");
  const updateDeck = useUpdateDeck();
  const { setArrayFilter } = useFilterActions();
  const [selected, setSelected] = useState<string[]>([]);

  if (!config) {
    return null;
  }

  if (availableSlugs.length === 0) {
    return (
      <section className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
        <h2 className="text-lg font-semibold">No {config.nounPlural} available</h2>
        <p className="text-muted-foreground text-sm">
          An admin needs to create at least one custom tag in the <code>{config.category}</code>{" "}
          category before this format can be built.
        </p>
      </section>
    );
  }

  const handleConfirm = () => {
    updateDeck.mutate(
      { deckId: deck.id, formatConfig: { tagSlugs: selected } },
      {
        // Seed the Custom Tags filter to match the chosen tags so the user
        // lands in the builder with only legal cards visible. The URL is the
        // single source of truth from here on (no soft fallback).
        onSuccess: () => setArrayFilter("customTags", selected),
      },
    );
  };

  return (
    <section className="space-y-4 rounded-md border p-6">
      <div>
        <h2 className="text-lg font-semibold">Pick one or more {config.nounPlural}</h2>
        <p className="text-muted-foreground text-sm">
          Every card in this deck must carry one of the chosen {config.nounPlural}. Picking multiple
          widens the legal pool (any card tagged with one of them is legal). You can change them
          later from the deck menu, but cards that don&apos;t match will be flagged.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="format-tag-picker">{capitalize(config.nounPlural)}</Label>
        <TagMultiSelect
          triggerId="format-tag-picker"
          category={config.category}
          nounPlural={config.nounPlural}
          selected={selected}
          onChange={setSelected}
        />
      </div>
      <Button disabled={selected.length === 0 || updateDeck.isPending} onClick={handleConfirm}>
        {updateDeck.isPending
          ? "Saving…"
          : `Start building${selected.length > 1 ? ` (${selected.length} ${config.nounPlural})` : ""}`}
      </Button>
    </section>
  );
}

/**
 * Convenience predicate: a tag-locked deck without any tags is in the
 * "needs picker" state. Used by the deck builder to gate the card browser
 * behind {@link FormatTagPickBanner}.
 *
 * @returns `true` when the banner should be shown instead of the builder.
 */
export function needsFormatTagPick(deck: Pick<DeckResponse, "format" | "formatConfig">): boolean {
  if (getFormatTagConfig(deck.format) === null) {
    return false;
  }
  return (deck.formatConfig?.tagSlugs ?? []).length === 0;
}
