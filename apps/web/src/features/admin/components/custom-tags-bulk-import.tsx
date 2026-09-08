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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAllCards } from "@/features/admin/hooks/use-admin-card-queries";
import { useAddCardsToCustomTag } from "@/features/collections/hooks/use-custom-tags";
import type { BulkImportPlan } from "@/features/collections/lib/custom-tag-bulk-import";
import { planCustomTagBulkImport } from "@/features/collections/lib/custom-tag-bulk-import";

export function BulkImport({ tags }: { tags: CustomTagResponse[] }) {
  const { data: allCards } = useAllCards();
  const mutation = useAddCardsToCustomTag();
  const [tagId, setTagId] = useState<string>(tags[0]?.id ?? "");
  const [text, setText] = useState("");
  const [result, setResult] = useState<{
    added: number;
    matched: number;
    tagLabel: string;
  } | null>(null);

  const plan: BulkImportPlan = planCustomTagBulkImport(text, allCards);

  const selectedTag = tags.find((t) => t.id === tagId);
  const canImport = selectedTag !== undefined && plan.cardIds.length > 0 && !mutation.isPending;

  const tagsByCategory = Map.groupBy(tags, (t) => t.categoryLabel);
  const tagItems = tags.map((tag) => ({ value: tag.id, label: tag.label }));

  async function handleImport() {
    if (!selectedTag) {
      return;
    }
    const matchedCount = plan.cardIds.length;
    try {
      const response = await mutation.mutateAsync({ tagId: selectedTag.id, cardIds: plan.cardIds });
      setResult({ added: response.added, matched: matchedCount, tagLabel: selectedTag.label });
      setText("");
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  if (tags.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-md border p-4">
      <SectionHeader>
        <SectionHeaderGroup>
          <SectionHeaderTitle as="h3">Bulk import</SectionHeaderTitle>
          <SectionHeaderDescription>
            Paste a decklist-style block (one card per line, optionally prefixed by a count) and
            attach the selected tag to every matched card. Re-importing is safe — cards already
            carrying the tag are left untouched.
          </SectionHeaderDescription>
        </SectionHeaderGroup>
      </SectionHeader>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="bulk-import-tag">Tag</Label>
          <Select
            items={tagItems}
            value={tagId}
            onValueChange={(next) => {
              if (next !== null) {
                setTagId(next);
                setResult(null);
              }
            }}
          >
            <SelectTrigger id="bulk-import-tag" className="h-8 w-40" aria-label="Tag">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...tagsByCategory.entries()].map(([categoryLabel, group]) => (
                <SelectGroup key={categoryLabel}>
                  <SelectLabel>{categoryLabel}</SelectLabel>
                  {group.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="bulk-import-text">Cards</Label>
        <Textarea
          id="bulk-import-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          placeholder={"1 Brazen Buccaneer\n1 Riptide Rex\n1 Bilgewater Bully"}
          rows={10}
          className="font-mono text-sm"
        />
      </div>

      <BulkImportPreview plan={plan} />

      <div className="flex items-center gap-3">
        <Button disabled={!canImport} onClick={() => void handleImport()}>
          {mutation.isPending
            ? "Importing…"
            : `Import ${plan.cardIds.length} card${plan.cardIds.length === 1 ? "" : "s"}`}
        </Button>
        {result && (
          <p className="text-sm">
            Added <span className="font-semibold">{result.added}</span> of {result.matched} matched
            card{result.matched === 1 ? "" : "s"} to{" "}
            <span className="font-semibold">{result.tagLabel}</span>
            {result.added < result.matched && (
              <span className="text-muted-foreground">
                {" "}
                ({result.matched - result.added} already tagged)
              </span>
            )}
            .
          </p>
        )}
      </div>
    </section>
  );
}

function BulkImportPreview({ plan }: { plan: BulkImportPlan }) {
  if (
    plan.matched.length === 0 &&
    plan.unmatched.length === 0 &&
    plan.ambiguous.length === 0 &&
    plan.warnings.length === 0
  ) {
    return null;
  }
  return (
    <div className="space-y-2 text-sm">
      <p>
        Matched <span className="font-semibold">{plan.matched.length}</span> card
        {plan.matched.length === 1 ? "" : "s"}.
      </p>
      {plan.unmatched.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">
            Unmatched: {plan.unmatched.length} name{plan.unmatched.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {plan.unmatched.map((name, i) => (
              <li key={`${name}-${i}`} className="font-mono">
                {name}
              </li>
            ))}
          </ul>
        </details>
      )}
      {plan.ambiguous.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">
            Ambiguous: {plan.ambiguous.length} name
            {plan.ambiguous.length === 1 ? "" : "s"} (skipped)
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {plan.ambiguous.map((a, i) => (
              <li key={`${a.name}-${i}`} className="font-mono">
                {a.name} ({a.matches.length} matches)
              </li>
            ))}
          </ul>
        </details>
      )}
      {plan.warnings.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">Skipped lines: {plan.warnings.length}</summary>
          <ul className="mt-1 list-disc pl-5">
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
