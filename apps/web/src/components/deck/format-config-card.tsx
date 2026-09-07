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

export function FormatConfigCard({ deckId, format, formatConfig, readOnly }: Props) {
  const { labels: formatLabels } = useDeckFormatList();
  const { all: customTags } = useCustomTagList();
  const [editOpen, setEditOpen] = useState(false);

  const config = getFormatTagConfig(format);
  if (!config) {
    return null;
  }

  const tagSlugs = formatConfig?.tagSlugs ?? [];
  // Unresolvable slugs are surfaced separately as CARD_NOT_IN_FORMAT_TAG; don't duplicate that here.
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
