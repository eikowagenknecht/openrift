import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { PlayIcon } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarHeightContext,
  PageTopBarPrimaryButton,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { DeckPresentation } from "@/components/present/deck-presentation";
import { PresentCardBrowser } from "@/components/present/present-card-browser";
import { PresentQueuePanel } from "@/components/present/present-queue-panel";
import { QueuePresentation } from "@/components/present/queue-presentation";
import type { QueueSource } from "@/components/present/queue-source-picker";
import { Badge } from "@/components/ui/badge";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { usePresentQueueStore } from "@/stores/present-queue-store";

export const Route = createLazyFileRoute("/_app/present")({
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
          zone={zone}
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
 * The builder is an ordinary app page and carries the usual header and footer.
 * Only the show itself is chrome-free, and it gets there by covering the shell
 * rather than by living outside it.
 *
 * Two columns: the queue is the sticky, inner-scrolled one and the card browser
 * is the window-scrolled one, not the other way round. The browser is a
 * virtualized grid whose virtualizer reads the *window* scroller, so putting it
 * in an inner scroll container renders it empty — the same constraint the
 * tier-list builder works around.
 *
 * @returns The queue builder page.
 */
function PresentQueueBuilder({ initialIds }: { initialIds: readonly string[] }) {
  const navigate = useNavigate();
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const headerHeight = useHeaderHeight();
  const queued = usePresentQueueStore((state) => state.ids.length);

  // Adopt whatever queue the URL arrived with, once. Leaving the builder drops
  // the draft, so coming back always starts from the URL rather than from a
  // queue left over from a previous visit.
  useEffect(() => {
    usePresentQueueStore.getState().load(initialIds);
    return usePresentQueueStore.getState().reset;
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount only: `initialIds` is the URL's queue at arrival, and re-running on a later search change would stomp the draft mid-edit
  }, []);

  const start = () => {
    // The updater form keeps the browser's filters in the URL, so leaving the
    // show lands back on the same filtered view the queue was built from.
    const ids = usePresentQueueStore.getState().ids;
    void navigate({ to: "/present", search: (prev) => ({ ...prev, cards: ids, i: 0 }) });
  };

  const addSource = (source: QueueSource) => {
    const { added, dropped } = usePresentQueueStore.getState().addMany(source.printingIds);
    if (dropped > 0) {
      toast.warning(
        `Added ${added} of ${source.printingIds.length} cards from ${source.label}. The queue holds ${MAX_QUEUE_LENGTH}.`,
      );
      return;
    }
    if (added === 0) {
      toast.warning(`Nothing to add from ${source.label}.`);
      return;
    }
    toast.success(`Added ${added} cards from ${source.label}.`);
  };

  const stickyTop = headerHeight + topBarHeight;

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY}>
          <PageTopBar>
            <PageTopBarTitle>Presentation mode</PageTopBarTitle>
            {queued > 0 && <Badge variant="outline">{queued} queued</Badge>}
            <PageTopBarActions>
              <PageTopBarPrimaryButton onClick={start} disabled={queued === 0}>
                <PlayIcon />
                Start presenting
              </PageTopBarPrimaryButton>
            </PageTopBarActions>
          </PageTopBar>
        </div>

        <div className="px-safe flex flex-1 flex-col gap-4 px-3 pt-3 lg:flex-row">
          <div className="w-full shrink-0 lg:w-[34%] lg:max-w-sm">
            <div
              className="lg:sticky lg:overflow-y-auto"
              style={{ top: stickyTop, maxHeight: `calc(100dvh - ${stickyTop}px)` }}
            >
              <Suspense
                fallback={<div className="text-muted-foreground text-sm">Loading cards…</div>}
              >
                <PresentQueuePanel onAdd={addSource} />
              </Suspense>
            </div>
          </div>
          <Suspense fallback={<div className="text-muted-foreground text-sm">Loading cards…</div>}>
            <PresentCardBrowser />
          </Suspense>
        </div>
      </div>
    </PageTopBarHeightContext>
  );
}
