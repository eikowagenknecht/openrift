import type { CardErrata } from "@openrift/shared";
import { CheckIcon, FileWarningIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDeleteCardErrata, useUpsertCardErrata } from "@/hooks/use-card-errata";

interface CardErrataManagerProps {
  cardId: string;
  errata: CardErrata | null;
  showForm?: boolean;
  onShowFormChange?: (show: boolean) => void;
}

/**
 * Inline admin panel for managing card errata (add/edit/remove).
 * Hidden when there is no errata and the form is closed.
 * @returns The errata management section, or null if nothing to show.
 */
export function CardErrataManager({
  cardId,
  errata,
  showForm,
  onShowFormChange,
}: CardErrataManagerProps) {
  const upsertErrata = useUpsertCardErrata();
  const deleteErrata = useDeleteCardErrata();

  const [isEditing, setIsEditing] = useState(false);
  const [correctedRulesText, setCorrectedRulesText] = useState("");
  const [correctedEffectText, setCorrectedEffectText] = useState("");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  function resetForm() {
    setCorrectedRulesText("");
    setCorrectedEffectText("");
    setSource("");
    setSourceUrl("");
    setEffectiveDate("");
  }

  function populateFromErrata(existing: CardErrata) {
    setCorrectedRulesText(existing.correctedRulesText ?? "");
    setCorrectedEffectText(existing.correctedEffectText ?? "");
    setSource(existing.source);
    setSourceUrl(existing.sourceUrl ?? "");
    setEffectiveDate(existing.effectiveDate ?? "");
  }

  function handleSave() {
    const rules = correctedRulesText.trim() || null;
    const effect = correctedEffectText.trim() || null;
    if (!rules && !effect) {
      return;
    }
    if (!source.trim()) {
      return;
    }
    upsertErrata.mutate(
      {
        cardId,
        correctedRulesText: rules,
        correctedEffectText: effect,
        source: source.trim(),
        sourceUrl: sourceUrl.trim() || null,
        effectiveDate: effectiveDate || null,
      },
      {
        onSuccess: () => {
          onShowFormChange?.(false);
          setIsEditing(false);
          resetForm();
        },
      },
    );
  }

  function handleCancel() {
    if (isEditing) {
      setIsEditing(false);
    } else {
      onShowFormChange?.(false);
    }
    resetForm();
  }

  // Hide entirely when there is no errata and the form is closed
  if (!errata && !showForm && !isEditing) {
    return null;
  }

  const showFormArea = showForm || isEditing;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <FileWarningIcon className="text-muted-foreground size-4" />
        <h3 className="font-medium">Errata</h3>
      </div>

      {/* Display existing errata */}
      {errata && !isEditing && (
        <div className="relative space-y-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                populateFromErrata(errata);
                setIsEditing(true);
              }}
            >
              <PencilIcon className="size-3" />
            </Button>
            <Button
              variant="destructive"
              size="icon-sm"
              onClick={() => deleteErrata.mutate({ cardId })}
              disabled={deleteErrata.isPending}
            >
              <XIcon className="size-3" />
            </Button>
          </div>
          {errata.correctedRulesText && (
            <div>
              <span className="text-muted-foreground font-medium">Rules: </span>
              <span>{errata.correctedRulesText}</span>
            </div>
          )}
          {errata.correctedEffectText && (
            <div>
              <span className="text-muted-foreground font-medium">Effect: </span>
              <span>{errata.correctedEffectText}</span>
            </div>
          )}
          <div className="text-muted-foreground">
            Source:{" "}
            {errata.sourceUrl ? (
              <a
                href={errata.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-500 underline"
              >
                {errata.source}
              </a>
            ) : (
              errata.source
            )}
            {errata.effectiveDate && <> &middot; {errata.effectiveDate}</>}
          </div>
        </div>
      )}

      {/* Add / Edit form */}
      {showFormArea ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Corrected rules text</Label>
              <Textarea
                value={correctedRulesText}
                onChange={(event) => setCorrectedRulesText(event.target.value)}
                placeholder="Leave empty if only effect text was corrected"
                className="min-h-16"
              />
            </div>
            <div className="space-y-1">
              <Label>Corrected effect text</Label>
              <Textarea
                value={correctedEffectText}
                onChange={(event) => setCorrectedEffectText(event.target.value)}
                placeholder="Leave empty if only rules text was corrected"
                className="min-h-16"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label>Source (required)</Label>
              <Input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="e.g. Official FAQ v2.1"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <Label>Source URL</Label>
              <Input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1">
              <Label>Effective date</Label>
              <DatePicker
                value={effectiveDate || null}
                onChange={setEffectiveDate}
                onClear={() => setEffectiveDate("")}
                className="w-44"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={
                upsertErrata.isPending ||
                !source.trim() ||
                (!correctedRulesText.trim() && !correctedEffectText.trim())
              }
            >
              {isEditing ? (
                <>
                  <CheckIcon className="mr-1" />
                  Update
                </>
              ) : (
                "Save"
              )}
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
