import type { Printing } from "@openrift/shared";
import { imageUrl, legendDisplayName } from "@openrift/shared";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { useCards } from "@/hooks/use-cards";
import { moveQueueEntry, searchPrintingsByName } from "@/lib/card-queue-search";
import { formatPublicCode } from "@/lib/format";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";

/**
 * Small square card thumbnail for the picker and queue rows.
 * @returns The thumbnail, or a name-only placeholder when the printing has no art.
 */
function QueueThumb({ printing }: { printing: Printing }) {
  const image = printing.images[0];
  if (!image) {
    return (
      <span className="bg-muted text-2xs text-muted-foreground aspect-card flex w-8 shrink-0 items-center justify-center rounded-sm p-0.5 text-center leading-tight">
        {printing.card.name.slice(0, 8)}
      </span>
    );
  }
  return (
    <img
      src={imageUrl(image.imageId, "400w")}
      alt=""
      width={400}
      height={558}
      loading="lazy"
      className="aspect-card w-8 shrink-0 rounded-sm object-cover"
    />
  );
}

/**
 * Search-and-queue editor shared by presentation mode and the overlay
 * dashboard: a name/code search at the top, results below as full-width rows,
 * and the assembled queue underneath with move and remove controls.
 *
 * The caller owns the queue (a list of printing ids) so it can live in a URL,
 * a store, or server state as that surface needs. `rowAction` lets a surface
 * hang its own per-row control off a queue entry — the dashboard uses it for
 * "push this one live".
 *
 * @returns The queue editor.
 */
export function CardQueueEditor({
  ids,
  onChange,
  rowAction,
  resultAction,
  className,
}: {
  ids: readonly string[];
  onChange: (ids: string[]) => void;
  /** Extra control rendered at the end of each queue row. */
  rowAction?: (printing: Printing, index: number) => ReactNode;
  /**
   * Extra control at the end of each search-result row. The overlay dashboard
   * puts "push live" here, so a card the creator did not prepare still reaches
   * the stream in one tap.
   */
  resultAction?: (printing: Printing) => ReactNode;
  className?: string;
}) {
  const { allPrintings, printingsById } = useCards();
  const [query, setQuery] = useState("");

  const results = searchPrintingsByName(query, allPrintings);
  const isFull = ids.length >= MAX_QUEUE_LENGTH;

  const add = (printing: Printing) => {
    if (isFull) {
      return;
    }
    onChange([...ids, printing.id]);
    setQuery("");
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a card by name or code…"
          aria-label="Search cards to add"
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {query.trim() !== "" && (
        <div className="border-border max-h-72 overflow-y-auto rounded-md border">
          {results.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">No cards match that.</p>
          ) : (
            <ul>
              {results.map((printing) => (
                <li key={printing.id} className="hover:bg-accent/50 flex items-center gap-1 pr-2">
                  <Pressable
                    onClick={() => add(printing)}
                    disabled={isFull}
                    className="flex min-w-0 flex-1 items-center gap-3 p-2 disabled:opacity-50"
                  >
                    <QueueThumb printing={printing} />
                    <span className="min-w-0 flex-1 truncate">
                      {legendDisplayName(printing.card)}
                    </span>
                    <span className="text-muted-foreground font-mono text-sm">
                      {formatPublicCode(printing)}
                    </span>
                  </Pressable>
                  {resultAction?.(printing)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isFull && (
        <p className="text-muted-foreground text-sm">
          The queue holds {MAX_QUEUE_LENGTH} cards. Remove one to add another.
        </p>
      )}

      {ids.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing queued yet. Search above and pick the cards you want to show, in the order you
          want to show them.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {ids.map((id, index) => {
            const printing = printingsById[id];
            if (!printing) {
              return null;
            }
            return (
              <li
                key={`${id}-${index}`}
                className="bg-card ring-border flex items-center gap-3 rounded-md p-2 ring-1"
              >
                <span className="text-muted-foreground w-6 shrink-0 text-center font-mono text-sm tabular-nums">
                  {index + 1}
                </span>
                <QueueThumb printing={printing} />
                <span className="min-w-0 flex-1 truncate">{legendDisplayName(printing.card)}</span>
                {rowAction?.(printing, index)}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onChange(moveQueueEntry(ids, index, -1))}
                  disabled={index === 0}
                  aria-label={`Move ${printing.card.name} earlier`}
                >
                  <ChevronUpIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onChange(moveQueueEntry(ids, index, 1))}
                  disabled={index === ids.length - 1}
                  aria-label={`Move ${printing.card.name} later`}
                >
                  <ChevronDownIcon className="size-4" />
                </Button>
                <ChipRemoveButton
                  onClick={() => onChange(ids.filter((_unused, at) => at !== index))}
                  aria-label={`Remove ${printing.card.name} from the queue`}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
