import type { DeckZone } from "@openrift/shared";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { PlayIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardQueueEditor } from "@/components/present/card-queue-editor";
import { DeckPresentation } from "@/components/present/deck-presentation";
import { QueuePresentation } from "@/components/present/queue-presentation";
import { Button } from "@/components/ui/button";
import { cn, CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/present")({
  component: PresentPage,
});

/**
 * Dark stand-in while the deck or catalog query settles, so no white flash
 * reaches a capture.
 * @returns The black stage placeholder.
 */
function StageFallback() {
  return <div className="fixed inset-0 z-50 bg-[#08090c]" />;
}

function PresentPage() {
  const { deck, cards, zone, i, edit } = Route.useSearch();
  const navigate = useNavigate();

  const setIndex = (index: number) => {
    // `replace` so a walk through 40 cards doesn't bury the page the creator
    // came from under 40 history entries.
    void navigate({ to: "/present", search: (prev) => ({ ...prev, i: index }), replace: true });
  };

  if (deck) {
    return (
      <Suspense fallback={<StageFallback />}>
        <DeckPresentation
          deckId={deck}
          zone={zone as DeckZone | undefined}
          index={i ?? 0}
          onIndexChange={setIndex}
          onExit={() => {
            void navigate({ to: "/decks/$deckId", params: { deckId: deck } });
          }}
        />
      </Suspense>
    );
  }

  if (cards && cards.length > 0 && edit !== true) {
    return (
      <Suspense fallback={<StageFallback />}>
        <QueuePresentation
          printingIds={cards}
          index={i ?? 0}
          onIndexChange={setIndex}
          onExit={() => {
            void navigate({
              to: "/present",
              search: (prev) => ({ ...prev, edit: true, i: undefined }),
            });
          }}
        />
      </Suspense>
    );
  }

  return <PresentQueueBuilder initialIds={cards ?? []} />;
}

/**
 * The pre-recording screen: assemble a queue of cards, then start the show.
 * Reached at `/present` with nothing to present, and on leaving a queue
 * presentation (which brings its queue back here for editing).
 *
 * @returns The queue builder page.
 */
function PresentQueueBuilder({ initialIds }: { initialIds: readonly string[] }) {
  const navigate = useNavigate();
  const [ids, setIds] = useState<string[]>([...initialIds]);

  const start = () => {
    void navigate({ to: "/present", search: { cards: ids, i: 0 } });
  };

  return (
    <div className={cn(PAGE_PADDING, CONTAINER_WIDTH, "flex flex-col gap-6 py-8")}>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Presentation mode</h1>
        <p className="text-muted-foreground max-w-prose">
          Build a queue of cards, then show them full screen with no app chrome around them — made
          for capturing this window straight into a recording or stream. Arrow keys step through the
          queue once you start.
        </p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground text-sm">Loading cards…</div>}>
        <CardQueueEditor ids={ids} onChange={setIds} />
      </Suspense>

      <div>
        <Button onClick={start} disabled={ids.length === 0}>
          <PlayIcon className="size-4" />
          Start presenting
        </Button>
      </div>
    </div>
  );
}
