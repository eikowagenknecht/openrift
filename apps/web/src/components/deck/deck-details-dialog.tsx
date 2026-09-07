import type { DeckLink } from "@openrift/shared";
import { ALLOWED_LINK_SITE_NAMES, isAllowedLinkUrl } from "@openrift/shared";
import { MAX_DECK_LINKS } from "@openrift/shared/contracts/decks";
import { useRef, useState } from "react";

import type { LinkDraft } from "@/components/link-rows-field";
import { LinkRowsField } from "@/components/link-rows-field";
import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { Code } from "@/components/ui/code";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCards } from "@/hooks/use-cards";
import type { DeckMetaPatch } from "@/hooks/use-decks";
import { useUpdateDeckMeta } from "@/hooks/use-decks";
import { useQuickAddSearch } from "@/hooks/use-quick-add-search";
import { cn } from "@/lib/utils";

const DESCRIPTION_MAX = 8000;

/** How many card suggestions the [[ autocomplete shows. */
const AUTOCOMPLETE_LIMIT = 6;

const PREVIEW_CARD_LINK_CLASS =
  "text-foreground inline font-medium underline decoration-dotted underline-offset-2";

/** The `[[` token being typed at the caret, or null when the caret isn't inside an unclosed card reference. */
export function cardTokenAtCaret(value: string, caret: number): string | null {
  const upto = value.slice(0, caret);
  const match = /\[\[(?<token>[^[\]\n]{0,60})$/u.exec(upto);
  return match?.groups?.token ?? null;
}

const ALLOWED_HOSTS_HINT = `Links must be https and point at one of: ${ALLOWED_LINK_SITE_NAMES.join(", ")}.`;

function toDrafts(links: readonly DeckLink[]): LinkDraft[] {
  return links.map((link) => ({ url: link.url, title: link.title ?? "" }));
}

function toLinks(drafts: readonly LinkDraft[]): DeckLink[] {
  return drafts.map((draft) => {
    const title = draft.title.trim();
    return title === "" ? { url: draft.url.trim() } : { url: draft.url.trim(), title };
  });
}

interface DeckDetailsDialogProps {
  deckId: string;
  currentName: string;
  currentDescription: string | null;
  currentLinks: readonly DeckLink[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeckDetailsDialog({
  deckId,
  currentName,
  currentDescription,
  currentLinks,
  open,
  onOpenChange,
}: DeckDetailsDialogProps) {
  const [name, setName] = useState(currentName);
  const [draft, setDraft] = useState(currentDescription ?? "");
  const [links, setLinks] = useState<LinkDraft[]>(() => toDrafts(currentLinks));
  const [pane, setPane] = useState<"write" | "preview">("write");
  const [token, setToken] = useState<string | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { update } = useUpdateDeckMeta(deckId);
  const { printingsByCardId } = useCards();

  // Unconditional, unlike the caret check that gates it: an empty query returns
  // no suggestions on its own, and a hook can't sit behind a ternary.
  const suggestions = useQuickAddSearch(token ?? "", printingsByCardId, {
    limit: AUTOCOMPLETE_LIMIT,
  });
  const clampedSuggestion = Math.min(suggestionIndex, Math.max(0, suggestions.length - 1));

  const filledLinks = links.filter((link) => link.url.trim() !== "");
  const linksValid = filledLinks.every((link) => isAllowedLinkUrl(link.url.trim()));

  const refreshToken = (element: HTMLTextAreaElement) => {
    const next = cardTokenAtCaret(element.value, element.selectionStart);
    if (next !== token) {
      setSuggestionIndex(0);
    }
    setToken(next);
  };

  const insertSuggestion = (cardName: string) => {
    const element = textareaRef.current;
    if (element === null || token === null) {
      return;
    }
    const caret = element.selectionStart;
    const start = draft.slice(0, caret).lastIndexOf("[[");
    if (start === -1) {
      return;
    }
    const next = `${draft.slice(0, start)}[[${cardName}]]${draft.slice(caret)}`;
    setDraft(next);
    setToken(null);
    // requestAnimationFrame waits for the controlled value to commit before the caret moves.
    const position = start + cardName.length + 4;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(position, position);
    });
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestionIndex((clampedSuggestion + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestionIndex((clampedSuggestion - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertSuggestion(suggestions[clampedSuggestion].cardName);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setToken(null);
    }
  };

  const trimmedName = name.trim();

  const handleSubmit = () => {
    if (!linksValid || trimmedName === "") {
      return;
    }
    const trimmed = draft.trim();
    const patch: DeckMetaPatch = {};
    if (trimmedName !== currentName) {
      patch.name = trimmedName;
    }
    if (trimmed !== (currentDescription ?? "")) {
      patch.description = trimmed === "" ? null : trimmed;
    }
    const nextLinks = toLinks(filledLinks);
    if (JSON.stringify(nextLinks) !== JSON.stringify(currentLinks)) {
      patch.links = nextLinks;
    }
    if (Object.keys(patch).length > 0) {
      update(patch);
    }
    onOpenChange(false);
  };

  const preview = (
    <div className="bg-card min-h-48 overflow-y-auto rounded-md border p-3 lg:max-h-96">
      {draft.trim() === "" ? (
        <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>
      ) : (
        <MarkdownText
          text={draft}
          headings
          className="text-muted-foreground text-sm"
          renderCardLink={(_name, children) => (
            <span className={PREVIEW_CARD_LINK_CLASS}>{children}</span>
          )}
        />
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setName(currentName);
          setDraft(currentDescription ?? "");
          setLinks(toDrafts(currentLinks));
          setPane("write");
          setToken(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Deck details</DialogTitle>
            <DialogDescription>
              The guide is Markdown. Type
              <Code className="mx-1">[[</Code>
              to link a card.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="deck-details-name">Name</Label>
            <Input
              id="deck-details-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: dialog input should grab focus
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="deck-details-description">Description</Label>
            <ToggleGroup
              variant="outline"
              spacing={0}
              size="sm"
              value={[pane]}
              onValueChange={([next]) => {
                if (next === "write" || next === "preview") {
                  setPane(next);
                }
              }}
              aria-label="Editor pane"
              className="lg:hidden"
            >
              <ToggleGroupItem value="write">Write</ToggleGroupItem>
              <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={cn("relative", pane === "preview" && "max-lg:hidden")}>
              <Textarea
                id="deck-details-description"
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  refreshToken(event.target);
                }}
                onSelect={(event) => refreshToken(event.currentTarget)}
                onKeyDown={handleTextareaKeyDown}
                onBlur={() => setToken(null)}
                maxLength={DESCRIPTION_MAX}
                rows={14}
                className="lg:max-h-96"
                placeholder="A few words about your deck…"
              />
              {suggestions.length > 0 && (
                <div
                  role="listbox"
                  aria-label="Card suggestions"
                  className="bg-popover absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border shadow-md"
                >
                  {suggestions.map((suggestion, index) => (
                    <Button
                      key={suggestion.cardId}
                      type="button"
                      role="option"
                      aria-selected={index === clampedSuggestion}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full justify-start rounded-none font-normal",
                        index === clampedSuggestion && "bg-muted",
                      )}
                      // Mousedown so the click wins against the textarea blur
                      // closing the popup.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertSuggestion(suggestion.cardName);
                      }}
                    >
                      {suggestion.cardName}
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-muted-foreground text-2xs mt-1 text-right tabular-nums">
                {draft.length} / {DESCRIPTION_MAX}
              </p>
            </div>
            <div className={cn(pane === "write" && "max-lg:hidden")}>{preview}</div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Links</Label>
            <LinkRowsField
              links={links}
              onChange={setLinks}
              max={MAX_DECK_LINKS}
              isValidUrl={isAllowedLinkUrl}
              urlPlaceholder="https://youtube.com/watch?v=…"
            />
            {!linksValid && <p className="text-destructive text-xs">{ALLOWED_HOSTS_HINT}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!linksValid || trimmedName === ""}>
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
