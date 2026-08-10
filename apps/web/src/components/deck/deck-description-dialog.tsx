import { isVideoGuideUrl } from "@openrift/shared";
import { useRef, useState } from "react";

import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
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
import { useUpdateDeckMeta } from "@/hooks/use-decks";
import { searchCards } from "@/hooks/use-quick-add-search";
import { cn } from "@/lib/utils";

const DESCRIPTION_MAX = 8000;

/** How many card suggestions the [[ autocomplete shows. */
const AUTOCOMPLETE_LIMIT = 6;

/** The inert preview look of a `[[Card Name]]` reference. */
const PREVIEW_CARD_LINK_CLASS =
  "text-foreground inline font-medium underline decoration-dotted underline-offset-2";

/**
 * The `[[` token being typed at the caret, or null when the caret isn't
 * inside an unclosed card reference.
 * @returns The partial card name after the opening brackets.
 */
export function cardTokenAtCaret(value: string, caret: number): string | null {
  const upto = value.slice(0, caret);
  const match = /\[\[(?<token>[^[\]\n]{0,60})$/u.exec(upto);
  return match?.groups?.token ?? null;
}

interface DeckDescriptionDialogProps {
  deckId: string;
  currentDescription: string | null;
  currentVideoUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The deck's guide editor: a side-by-side Markdown write/preview surface with
 * `[[` card-name autocomplete, plus the video guide link. On phones the two
 * panes collapse into a Write/Preview toggle.
 * @returns The dialog.
 */
export function DeckDescriptionDialog({
  deckId,
  currentDescription,
  currentVideoUrl,
  open,
  onOpenChange,
}: DeckDescriptionDialogProps) {
  const [draft, setDraft] = useState(currentDescription ?? "");
  const [video, setVideo] = useState(currentVideoUrl ?? "");
  const [pane, setPane] = useState<"write" | "preview">("write");
  const [token, setToken] = useState<string | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { update } = useUpdateDeckMeta(deckId);
  const { printingsByCardId } = useCards();

  const suggestions =
    token !== null && token.length > 0
      ? searchCards(token, printingsByCardId, { limit: AUTOCOMPLETE_LIMIT })
      : [];
  const clampedSuggestion = Math.min(suggestionIndex, Math.max(0, suggestions.length - 1));

  const trimmedVideo = video.trim();
  const videoValid = trimmedVideo === "" || isVideoGuideUrl(trimmedVideo);

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
    // Focus returns to the caret right after the closing brackets once the
    // controlled value has been committed.
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

  const handleSubmit = () => {
    if (!videoValid) {
      return;
    }
    const trimmed = draft.trim();
    const patch: { description?: string | null; videoUrl?: string | null } = {};
    if (trimmed !== (currentDescription ?? "")) {
      patch.description = trimmed === "" ? null : trimmed;
    }
    if (trimmedVideo !== (currentVideoUrl ?? "")) {
      patch.videoUrl = trimmedVideo === "" ? null : trimmedVideo;
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
          setDraft(currentDescription ?? "");
          setVideo(currentVideoUrl ?? "");
          setPane("write");
          setToken(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit description</DialogTitle>
            <DialogDescription>
              Write your deck guide in Markdown: headings, lists, links. Type
              <code className="bg-muted mx-1 rounded px-1">[[</code>
              to link a card by name.
            </DialogDescription>
          </DialogHeader>

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

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={cn("relative", pane === "preview" && "max-lg:hidden")}>
              <Textarea
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
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: dialog input should grab focus
                autoFocus
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
            <Label htmlFor="deck-video-url">Video guide (YouTube link)</Label>
            <Input
              id="deck-video-url"
              value={video}
              onChange={(event) => setVideo(event.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              maxLength={300}
              aria-invalid={!videoValid}
            />
            {!videoValid && (
              <p className="text-destructive text-xs">
                Must be a YouTube link (youtube.com or youtu.be).
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!videoValid}>
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
