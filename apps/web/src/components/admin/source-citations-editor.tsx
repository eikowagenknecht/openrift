import { PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The shape every citation list shares: a free label and an optional link. */
export interface EditableCitation {
  id: string;
  label: string;
  sourceUrl: string | null;
}

interface SourceCitationsEditorProps<T extends EditableCitation> {
  citations: readonly T[];
  /** True while the list itself is still loading. */
  isPending: boolean;
  /** Sentence under the heading saying what this list is for. */
  description: ReactNode;
  /** Sentence shown in place of the list when nothing is cited yet. */
  emptyText: string;
  /** Example value for the label field, e.g. "Twitch VOD". */
  labelPlaceholder: string;
  /**
   * Prefix for the two field ids. Distinct per surface, so a page hosting more
   * than one editor never points two `<Label htmlFor>` at the same input.
   */
  idPrefix: string;
  creating: boolean;
  deleting: boolean;
  onAdd: (input: { label: string; sourceUrl: string | null }) => Promise<unknown>;
  onDelete: (citationId: string) => void;
  /** Optional mark next to a citation's label (meta's provider badge). */
  renderBadge?: (citation: T) => ReactNode;
  /**
   * When this returns a string, the row cannot be deleted here and says so
   * instead. Meta uses it for provider rows, which are owned by their
   * candidate's link.
   */
  lockedReason?: (citation: T) => string | null;
}

/**
 * One citation row: its label, an optional badge, its link, and either a delete
 * button or the reason it has none.
 *
 * @returns The citation row.
 */
function CitationRow<T extends EditableCitation>({
  citation,
  deleting,
  onDelete,
  renderBadge,
  lockedReason,
}: {
  citation: T;
  deleting: boolean;
  onDelete: (citationId: string) => void;
  renderBadge?: (citation: T) => ReactNode;
  lockedReason?: (citation: T) => string | null;
}) {
  const locked = lockedReason?.(citation) ?? null;
  return (
    <li className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{citation.label}</span>
          {renderBadge?.(citation)}
        </div>
        {citation.sourceUrl !== null && (
          <a
            href={citation.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground block truncate text-sm underline underline-offset-2"
          >
            {citation.sourceUrl}
          </a>
        )}
      </div>
      {locked === null ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete citation ${citation.label}`}
          disabled={deleting}
          onClick={() => onDelete(citation.id)}
        >
          <Trash2Icon className="size-4" />
        </Button>
      ) : (
        <span className="text-muted-foreground shrink-0 text-sm">{locked}</span>
      )}
    </li>
  );
}

/**
 * The citation list as an admin edits it: what the public page credits, plus a
 * form for adding another. Shared by the meta archive's event editor and the
 * catalog's promo printings — the two lists differ in what owns a row, not in
 * how a citation looks or is entered, so the differences arrive as the
 * `renderBadge` / `lockedReason` callbacks rather than a second copy of this.
 *
 * @returns The citation editor.
 */
export function SourceCitationsEditor<T extends EditableCitation>({
  citations,
  isPending,
  description,
  emptyText,
  labelPlaceholder,
  idPrefix,
  creating,
  deleting,
  onAdd,
  onDelete,
  renderBadge,
  lockedReason,
}: SourceCitationsEditorProps<T>) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const trimmedLabel = label.trim();

  async function handleAdd() {
    // Resolved before the try: the React Compiler cannot lower a conditional
    // that sits inside one.
    const trimmedUrl = url.trim();
    const sourceUrl = trimmedUrl.length > 0 ? trimmedUrl : null;
    try {
      await onAdd({ label: trimmedLabel, sourceUrl });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    setLabel("");
    setUrl("");
  }

  return (
    <div className="space-y-2">
      <div>
        <Label>Citations</Label>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      {isPending && <p className="text-muted-foreground text-sm">Loading citations…</p>}
      {!isPending && citations.length === 0 && (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      )}
      {citations.length > 0 && (
        <ul className="rounded-md border px-3">
          {citations.map((citation) => (
            <CitationRow
              key={citation.id}
              citation={citation}
              deleting={deleting}
              onDelete={onDelete}
              renderBadge={renderBadge}
              lockedReason={lockedReason}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor={`${idPrefix}-label`}>Label</Label>
          <Input
            id={`${idPrefix}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={labelPlaceholder}
          />
        </div>
        <div className="min-w-40 flex-2 space-y-1.5">
          <Label htmlFor={`${idPrefix}-url`}>Link</Label>
          <Input
            id={`${idPrefix}-url`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <Button
          variant="outline"
          disabled={trimmedLabel.length === 0 || creating}
          onClick={handleAdd}
        >
          <PlusIcon />
          Add citation
        </Button>
      </div>
    </div>
  );
}
