import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { PlayIcon } from "lucide-react";
import { Suspense, useEffect, useRef } from "react";
import { toast } from "sonner";

import { BuilderWorkbench } from "@/components/layout/builder-workbench";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarPrimaryButton,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { FilterSearchProvider } from "@/features/cards/lib/search-schemas";
import { DeckPresentation } from "@/features/stage/components/deck-presentation";
import { PresentCardBrowser } from "@/features/stage/components/present-card-browser";
import { PresentQueuePanel } from "@/features/stage/components/present-queue-panel";
import { QueuePresentation } from "@/features/stage/components/queue-presentation";
import type { QueueSource } from "@/features/stage/components/queue-source-picker";
import { StageDndContext } from "@/features/stage/components/stage-dnd-context";
import { StageOutputBlock } from "@/features/stage/components/stage-output-block";
import {
  OwnedTierListPresentation,
  SharedTierListPresentation,
} from "@/features/stage/components/tier-list-presentation";
import { useStagePresets } from "@/features/stage/hooks/use-stage-presets";
import { MAX_QUEUE_LENGTH } from "@/features/stage/lib/presentation-queue";
import {
  queueDraftSearch,
  startPresentingSearch,
} from "@/features/stage/lib/presentation-queue-search";
import { usePresentQueueStore } from "@/features/stage/stores/present-queue-store";
import { applyStagePresetConfig } from "@/features/stage/stores/stage-preset-actions";

export const Route = createLazyFileRoute("/_app/stage")({
  component: StagePage,
});

// Dark stand-in while the deck or catalog query settles, so no white flash reaches a capture.
function StageFallback() {
  return <div className="fixed inset-0 z-50 bg-[#08090c]" />;
}

function StagePage() {
  const search = Route.useSearch();
  const { deck, tier, tierShare, cards, zone, i, edit, mode, preset } = search;
  const navigate = useNavigate();
  const { data: presets } = useStagePresets();
  const presetApplied = useRef(false);

  // Applied once from the first preset list; re-running later would undo
  // switches flipped since, including mid-recording.
  useEffect(() => {
    if (presetApplied.current || preset === undefined || presets === undefined) {
      return;
    }
    presetApplied.current = true;
    const found = presets.find((candidate) => candidate.id === preset);
    // An id that doesn't resolve (deleted, or someone else's) is dropped
    // silently: a stale bookmark opens the stage undressed.
    if (found) {
      applyStagePresetConfig(found.config);
    }
  }, [preset, presets]);

  const setIndex = (index: number) => {
    // `replace` so a walk through 40 cards doesn't bury the page the creator
    // came from under 40 history entries.
    void navigate({ to: "/stage", search: (prev) => ({ ...prev, i: index }), replace: true });
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

  if (tier) {
    return (
      <Suspense fallback={<StageFallback />}>
        <OwnedTierListPresentation
          tierListId={tier}
          index={i ?? 0}
          editing={mode === "edit"}
          onEditingChange={(next) => {
            // `replace` so flipping between ranking and showing during a segment
            // doesn't build a history stack the back button has to climb.
            void navigate({
              to: "/stage",
              search: (prev) => ({ ...prev, mode: next ? "edit" : undefined }),
              replace: true,
            });
          }}
          onIndexChange={setIndex}
          onExit={() => {
            void navigate({ to: "/tier-lists/$tierListId", params: { tierListId: tier } });
          }}
        />
      </Suspense>
    );
  }

  if (tierShare) {
    return (
      <Suspense fallback={<StageFallback />}>
        <SharedTierListPresentation
          token={tierShare}
          index={i ?? 0}
          onIndexChange={setIndex}
          onExit={() => {
            void navigate({ to: "/tier-lists/share/$token", params: { token: tierShare } });
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
              to: "/stage",
              search: (prev) => ({ ...prev, edit: true, i: undefined }),
            });
          }}
        />
      </Suspense>
    );
  }

  // Only this branch needs FilterSearchProvider: a presentation shows a fixed list and never filters.
  return (
    <FilterSearchProvider value={search}>
      <StageBuilder initialIds={cards ?? []} />
    </FilterSearchProvider>
  );
}

// The show is chrome-free by covering the shell, not by living outside it;
// this builder stays an ordinary page with the usual header and footer.
function StageBuilder({ initialIds }: { initialIds: readonly string[] }) {
  const navigate = useNavigate();
  const queued = usePresentQueueStore((state) => state.ids.length);

  // Loads the URL's queue once, then keeps `?cards=` synced to it. Subscribed
  // after the load, and unsubscribed before the reset, to avoid feedback loops.
  useEffect(() => {
    usePresentQueueStore.getState().load(initialIds);
    const unsubscribe = usePresentQueueStore.subscribe((state, previous) => {
      if (state.ids === previous.ids) {
        return;
      }
      // `replace` so building a queue card by card doesn't bury the page the
      // creator came from under one history entry per click.
      void navigate({
        to: "/stage",
        search: (prev) => queueDraftSearch(prev, state.ids),
        replace: true,
      });
    });
    return () => {
      unsubscribe();
      usePresentQueueStore.getState().reset();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount only: `initialIds` is the URL's queue at arrival, and re-running on a later search change would stomp the draft mid-edit
  }, []);

  const start = () => {
    // The updater form keeps the browser's filters in the URL, so leaving the
    // show lands back on the same filtered view the queue was built from.
    const ids = usePresentQueueStore.getState().ids;
    void navigate({ to: "/stage", search: (prev) => startPresentingSearch(prev, ids) });
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

  return (
    <StageDndContext>
      <BuilderWorkbench
        // Wider than the tier builder's aside: it carries the queue and the OBS
        // output's scene setup, whose placement controls need the room.
        asideClassName="lg:w-[38%] lg:max-w-md"
        aside={
          <Suspense fallback={<div className="text-muted-foreground text-sm">Loading cards…</div>}>
            <div className="flex flex-col gap-6">
              <PresentQueuePanel onAdd={addSource} />
              <StageOutputBlock onStart={start} canStart={queued > 0} />
            </div>
          </Suspense>
        }
        topBar={
          <PageTopBar>
            <PageTopBarTitle>Stage</PageTopBarTitle>
            {queued > 0 && <Badge variant="outline">{queued} queued</Badge>}
            <PageTopBarActions>
              <PageTopBarPrimaryButton onClick={start} disabled={queued === 0}>
                <PlayIcon />
                Start presenting
              </PageTopBarPrimaryButton>
            </PageTopBarActions>
          </PageTopBar>
        }
      >
        <Suspense fallback={<div className="text-muted-foreground text-sm">Loading cards…</div>}>
          <PresentCardBrowser />
        </Suspense>
      </BuilderWorkbench>
    </StageDndContext>
  );
}
