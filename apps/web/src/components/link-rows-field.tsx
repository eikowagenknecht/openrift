import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** One editable row: both fields stay strings so a half-typed row is valid state. */
export interface LinkDraft {
  url: string;
  title: string;
}

interface LinkRowsFieldProps {
  links: LinkDraft[];
  onChange: (next: LinkDraft[]) => void;
  /** How many rows the caller accepts; the add button hides at the cap. */
  max: number;
  /** Marks a row invalid. Only consulted for rows with a non-empty URL. */
  isValidUrl: (url: string) => boolean;
  urlPlaceholder?: string;
  titlePlaceholder?: string;
  addLabel?: string;
}

/**
 * A repeatable URL + title list. Empty rows are the caller's to filter on save,
 * so a user can add a row and abandon it. With no rows yet only the add button
 * shows, which keeps an unused field from competing with the rest of the form.
 * Shared by the copy-details and deck-details dialogs.
 * @returns The rows plus their add button.
 */
export function LinkRowsField({
  links,
  onChange,
  max,
  isValidUrl,
  urlPlaceholder = "https://…",
  titlePlaceholder = "Title",
  addLabel = "Add link",
}: LinkRowsFieldProps) {
  const replaceAt = (index: number, patch: Partial<LinkDraft>) => {
    onChange(links.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  return (
    <>
      {links.map((link, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- drafts have no stable identity
        <div key={index} className="flex items-center gap-2">
          <Input
            value={link.url}
            onChange={(event) => replaceAt(index, { url: event.target.value })}
            placeholder={urlPlaceholder}
            maxLength={500}
            aria-label={`Link ${index + 1} URL`}
            aria-invalid={link.url.trim() !== "" && !isValidUrl(link.url.trim())}
          />
          <Input
            className="w-28"
            value={link.title}
            onChange={(event) => replaceAt(index, { title: event.target.value })}
            maxLength={100}
            placeholder={titlePlaceholder}
            aria-label={`Link ${index + 1} title`}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onChange(links.filter((_entry, i) => i !== index))}
            aria-label={`Remove link ${index + 1}`}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      {links.length < max && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => onChange([...links, { url: "", title: "" }])}
        >
          <PlusIcon />
          {addLabel}
        </Button>
      )}
    </>
  );
}
