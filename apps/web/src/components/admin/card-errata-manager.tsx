import type { CardErrata } from "@openrift/shared";
import { CheckIcon, FileWarningIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
        <div className="space-y-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          {errata.correctedRulesText && (
            <div>
              <span className="text-muted-foreground text-xs font-medium">Rules: </span>
              <span className="text-sm">{errata.correctedRulesText}</span>
            </div>
          )}
          {errata.correctedEffectText && (
            <div>
              <span className="text-muted-foreground text-xs font-medium">Effect: </span>
              <span className="text-sm">{errata.correctedEffectText}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">
              Source: {errata.source}
              {errata.sourceUrl && (
                <>
                  {" "}
                  (
                  <a
                    href={errata.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-500 underline"
                  >
                    link
                  </a>
                  )
                </>
              )}
              {errata.effectiveDate && <> &middot; {errata.effectiveDate}</>}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto size-5"
              onClick={() => {
                populateFromErrata(errata);
                setIsEditing(true);
              }}
            >
              <PencilIcon className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-5"
              onClick={() => deleteErrata.mutate({ cardId })}
              disabled={deleteErrata.isPending}
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Add / Edit form */}
      {showFormArea ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Corrected rules text</Label>
              <Textarea
                value={correctedRulesText}
                onChange={(event) => setCorrectedRulesText(event.target.value)}
                placeholder="Leave empty if only effect text was corrected"
                className="min-h-16 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Corrected effect text</Label>
              <Textarea
                value={correctedEffectText}
                onChange={(event) => setCorrectedEffectText(event.target.value)}
                placeholder="Leave empty if only rules text was corrected"
                className="min-h-16 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">Source (required)</Label>
              <Input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="e.g. Official FAQ v2.1"
                className="h-7 text-xs"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">Source URL</Label>
              <Input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://..."
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Effective date</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
                className="h-7 w-36 text-xs"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={
                upsertErrata.isPending ||
                !source.trim() ||
                (!correctedRulesText.trim() && !correctedEffectText.trim())
              }
            >
              {isEditing ? (
                <>
                  <CheckIcon className="mr-1 size-3" />
                  Update
                </>
              ) : (
                "Save"
              )}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : errata ? (
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs"
          onClick={() => {
            resetForm();
            onShowFormChange?.(true);
          }}
        >
          <PlusIcon className="mr-1 size-3" />
          Replace errata
        </Button>
      ) : null}
    </section>
  );
}
