import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pressable } from "@/components/ui/pressable";
import { Slider } from "@/components/ui/slider";
import { useUpdateDeckMeta } from "@/features/decks/hooks/use-decks";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { coverOverflowPx, coverPositionFromDrag } from "@/lib/cover-focus";
import { cn } from "@/lib/utils";

/** Default vertical crop focus, matching the legend backdrop's framing. */
const DEFAULT_POSITION = 20;

interface DeckCoverDialogProps {
  deckId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: DeckBuilderCard[];
  coverCardId: string | null;
  coverPrintingId: string | null;
  coverPosition: number | null;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
}

export function DeckCoverDialog({
  deckId,
  open,
  onOpenChange,
  cards,
  coverCardId,
  coverPrintingId,
  coverPosition,
  getThumbnail,
}: DeckCoverDialogProps) {
  const { update, isPending } = useUpdateDeckMeta(deckId);
  const [draftCardId, setDraftCardId] = useState<string | null>(coverCardId);
  const [draftPrintingId, setDraftPrintingId] = useState<string | null>(coverPrintingId);
  const [draftPosition, setDraftPosition] = useState(coverPosition ?? DEFAULT_POSITION);

  // Legend-derived default is the leading tile: `cards` is passed in that order.
  const seen = new Set<string>();
  const choices: { cardId: string; printingId: string | null; name: string; thumbnail: string }[] =
    [];
  for (const card of cards) {
    const key = `${card.cardId}|${card.preferredPrintingId ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const thumbnail = getThumbnail(card.cardId, card.preferredPrintingId);
    if (thumbnail) {
      choices.push({
        cardId: card.cardId,
        printingId: card.preferredPrintingId,
        name: card.cardName,
        thumbnail,
      });
    }
  }

  const draftThumb = draftCardId === null ? undefined : getThumbnail(draftCardId, draftPrintingId);

  // Measurements are frozen at pointer-down so the art tracks the cursor 1:1.
  const previewRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startPosition: number;
    overflow: number;
  } | null>(null);

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const image = previewRef.current;
    if (!image) {
      return;
    }
    const overflow = coverOverflowPx({
      boxWidth: image.clientWidth,
      boxHeight: image.clientHeight,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    });
    if (overflow <= 0) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPosition: draftPosition,
      overflow,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setDraftPosition(
      coverPositionFromDrag(drag.startPosition, event.clientY - drag.startY, drag.overflow),
    );
  };

  const handlePreviewPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSave = () => {
    if (draftCardId === null) {
      update(
        { coverCardId: null, coverPrintingId: null, coverPosition: null },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    update(
      {
        coverCardId: draftCardId,
        coverPrintingId: draftPrintingId,
        coverPosition: draftPosition,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDraftCardId(coverCardId);
          setDraftPrintingId(coverPrintingId);
          setDraftPosition(coverPosition ?? DEFAULT_POSITION);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Deck cover art</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {draftThumb && (
            <div
              className="bg-muted h-24 touch-none overflow-hidden rounded-lg border"
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerEnd}
              onPointerCancel={handlePreviewPointerEnd}
            >
              <img
                ref={previewRef}
                src={draftThumb}
                alt="Cover preview"
                draggable={false}
                className="h-full w-full cursor-grab object-cover active:cursor-grabbing"
                style={{ objectPosition: `50% ${draftPosition}%` }}
              />
            </div>
          )}
          {draftCardId === null && (
            <div className="text-muted-foreground bg-muted/30 flex h-24 items-center justify-center rounded-lg border border-dashed text-sm">
              Default: the deck&rsquo;s Legend art
            </div>
          )}

          {draftCardId !== null && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Vertical focus</Label>
                <span className="text-muted-foreground text-sm">Or drag the preview</span>
              </div>
              <Slider
                aria-label="Vertical focus"
                value={[draftPosition]}
                min={0}
                max={100}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  if (typeof next === "number") {
                    setDraftPosition(next);
                  }
                }}
              />
            </div>
          )}

          <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto p-1">
            <Pressable
              onClick={() => setDraftCardId(null)}
              aria-pressed={draftCardId === null}
              className={cn(
                "aspect-card bg-muted/30 text-muted-foreground flex w-24 shrink-0 items-center justify-center rounded-md border border-dashed p-1 text-center text-xs",
                draftCardId === null && "ring-primary ring-2",
              )}
            >
              Legend (default)
            </Pressable>
            {choices.map((choice) => {
              const isActive =
                draftCardId === choice.cardId && draftPrintingId === choice.printingId;
              return (
                <Pressable
                  key={`${choice.cardId}|${choice.printingId ?? ""}`}
                  onClick={() => {
                    setDraftCardId(choice.cardId);
                    setDraftPrintingId(choice.printingId);
                  }}
                  aria-pressed={isActive}
                  className={cn(
                    "aspect-card w-24 shrink-0 overflow-hidden rounded-md",
                    isActive && "ring-primary ring-2",
                  )}
                >
                  <img
                    src={choice.thumbnail}
                    alt={choice.name}
                    title={choice.name}
                    loading="lazy"
                    draggable={false}
                    className="h-full w-full rounded-md object-cover"
                  />
                </Pressable>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
