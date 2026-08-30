import { formatDayTimeLocal } from "@openrift/shared";
import { RefreshCwIcon } from "lucide-react";

import { PageTopBarButton } from "@/components/layout/page-top-bar";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSecondsUntil } from "@/hooks/use-seconds-until";

interface RefreshCountdownButtonProps {
  onRefresh: () => void;
  isFetching: boolean;
  /** The query's `dataUpdatedAt`; zero before the first successful fetch. */
  dataUpdatedAt: number;
  /** The query's auto-refresh cadence, or false where this view does not poll. */
  intervalMs: number | false;
}

/**
 * Top-bar Refresh action for an auto-refreshing admin page, counting down to the
 * next automatic fetch. Both readings come off the viewer's clock, so they stay
 * hidden until hydration — rendering them in the SSR pass would mismatch every
 * non-UTC visitor.
 *
 * @returns The refresh button.
 */
export function RefreshCountdownButton({
  onRefresh,
  isFetching,
  dataUpdatedAt,
  intervalMs,
}: RefreshCountdownButtonProps) {
  const hydrated = useHydrated();
  const polling = intervalMs !== false && dataUpdatedAt > 0;
  const secondsToRefresh = useSecondsUntil(polling ? dataUpdatedAt + intervalMs : null);
  const lastUpdated =
    hydrated && dataUpdatedAt > 0 ? formatDayTimeLocal(new Date(dataUpdatedAt)) : "";

  return (
    <PageTopBarButton
      onClick={onRefresh}
      disabled={isFetching}
      title={lastUpdated ? `Last updated ${lastUpdated}` : undefined}
    >
      <RefreshCwIcon className={isFetching ? "animate-spin" : ""} />
      Refresh
      {hydrated && polling && !isFetching && (
        <span className="text-muted-foreground tabular-nums">{secondsToRefresh}s</span>
      )}
    </PageTopBarButton>
  );
}
