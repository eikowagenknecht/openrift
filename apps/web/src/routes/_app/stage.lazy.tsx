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
import { DeckPresentation } from "@/components/present/deck-presentation";
import { PresentCardBrowser } from "@/components/present/present-card-browser";
import { PresentQueuePanel } from "@/components/present/present-queue-panel";
import { QueuePresentation } from "@/components/present/queue-presentation";
import type { QueueSource } from "@/components/present/queue-source-picker";
import { RankLivePresentation } from "@/components/present/rank-live-presentation";
import { StageOutputBlock } from "@/components/present/stage-output-block";
import {
  OwnedTierListPresentation,
  SharedTierListPresentation,
} from "@/components/present/tier-list-presentation";
import { Badge } from "@/components/ui/badge";
import { useStagePresets } from "@/hooks/use-stage-presets";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { applyStagePresetConfig } from "@/lib/stage-preset-apply";
import { usePresentQueueStore } from "@/stores/present-queue-store";

export const Route = createLazyFileRoute("/_app/stage")({
  component: StagePage,
});

/**
 * Dark stand-in while the deck or catalog query settles, so no white flash
 * reaches a capture.
 * @returns The black stage placeholder.
 */
function StageFallback() {
  return <div className="fixed inset-0 z-50 bg-[#08090c]" />;
}

function StagePage() {
  const search = Route.useSearch();
  const { deck, tier, tierShare, cards, zone, i, edit, mode, preset } = search;
  const navigate = useNavigate();
  const { data: presets } = useStagePresets();
  const presetApplied = useRef(false);

  // Dressing arrives once, on the first list the query hands back. Deliberately
  // not re-run when the URL or the list changes later: a preset is a starting
  // point, and reapplying it would undo every switch flipped since — including
  // mid-recording.
  useEffect(() => {
    if (presetApplied.current || preset === undefined || presets === undefined) {
      return;
    }
    presetApplied.current = true;
    const found = presets.find((candidate) => candidate.id === preset);
    // An id that no longer resolves (deleted, or someone else's) is silently
    // dropped: a stale bookmark opens the stage undressed rather than failing.
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

  if (tier && mode === "rank") {
    return (
      <Suspense fallback={<StageFallback />}>
        <RankLivePresentation
          tierListId={tier}
          onExit={() => {
            void navigate({ to: "/tier-lists/$tierListId", params: { tierListId: tier } });
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

  // The builder's card browser reads its filters from the URL through the
  // provider, so it has to sit inside one. Only this branch needs it — a
  // presentation shows a fixed list and never filters.
  return (
    <FilterSearchProvider value={search}>
      <StageBuilder initialIds={cards ?? []} />
    </FilterSearchProvider>
  );
}

/**
 * The stage's control surface: assemble a queue of cards, then send it to one
 * of the two outputs — a full-screen show on this screen, or the OBS browser
 * source. Reached at `/stage` with nothing to present, and on leaving a queue
 * presentation (which brings its queue back here for editing).
 *
 * The builder is an ordinary app page and carries the usual header and footer.
 * Only the show itself is chrome-free, and it gets there by covering the shell
 * rather than by living outside it. Laid out in the shared
 * {@link BuilderWorkbench}, the same shell the tier-list builder uses.
 *
 * @returns The stage builder page.
 */
function StageBuilder({ initialIds }: { initialIds: readonly string[] }) {
  const navigate = useNavigate();
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
    void navigate({ to: "/stage", search: (prev) => ({ ...prev, cards: ids, i: 0 }) });
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
  );
}
