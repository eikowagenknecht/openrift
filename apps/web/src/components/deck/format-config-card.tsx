import type { DeckFormatConfig } from "@openrift/shared";
import { PencilIcon } from "lucide-react";
import { useState } from "react";

import { EditFormatTagsDialog } from "@/components/deck/edit-format-tags-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCustomTagList, useDeckFormatList } from "@/hooks/use-enums";
import { getFormatTagConfig } from "@/lib/format-tag-config";

interface Props {
  deckId: string;
  format: string;
  formatConfig: DeckFormatConfig | null;
  readOnly?: boolean;
}

/**
 * Overview-area summary of a deck's format-specific settings, rendered at
 * the top of the deck overview for tag-locked formats. Shows the chosen
 * tags (e.g. regions) + an Edit button. Non-tag-locked formats render
 * nothing, so this can sit unconditionally in the overview layout.
 *
 * @returns The card, or null when the deck's format has no config to show.
 */
export function FormatConfigCard({ deckId, format, formatConfig, readOnly }: Props) {
  const { labels: formatLabels } = useDeckFormatList();
  const { all: customTags } = useCustomTagList();
  const [editOpen, setEditOpen] = useState(false);

  const config = getFormatTagConfig(format);
  if (!config) {
    return null;
  }

  const tagSlugs = formatConfig?.tagSlugs ?? [];
  // Drop slugs that no longer resolve (admin-deleted) from the display;
  // validation will surface that separately as CARD_NOT_IN_FORMAT_TAG.
  const visibleSlugs = tagSlugs.filter((slug) => customTags.some((tag) => tag.slug === slug));
  const labelFor = (slug: string) => customTags.find((tag) => tag.slug === slug)?.label ?? slug;
  const formatLabel = formatLabels[format] ?? format;

  return (
    <Card className="flex-row items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <span className="text-muted-foreground text-xs leading-4">{formatLabel}</span>
        <div className="text-lg leading-7 font-semibold">
          {visibleSlugs.length === 0
            ? `No ${config.nounPlural} picked`
            : visibleSlugs.map((slug) => labelFor(slug)).join(" + ")}
        </div>
      </div>
      {!readOnly && (
        <>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <PencilIcon className="size-4" />
            Edit
          </Button>
          <EditFormatTagsDialog
            deckId={deckId}
            format={format}
            currentSlugs={visibleSlugs}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        </>
      )}
    </Card>
  );
}
