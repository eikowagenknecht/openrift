import type { DeckViolation } from "@openrift/shared/deck-rules";
import { WellKnown } from "@openrift/shared/well-known";
import { CheckIcon, CircleAlertIcon } from "lucide-react";

import { ViolationBadge } from "@/components/deck/deck-validation-banner";
import { Badge } from "@/components/ui/badge";
import { useDeckFormatList } from "@/hooks/use-enums";
import type { DeckFormatBadgeKind } from "@/lib/deck-format-badge-state";
import { deckFormatBadgeState } from "@/lib/deck-format-badge-state";
import { cn } from "@/lib/utils";

/**
 * Two-state badge with no build figure, for the deck-check surfaces. Deck
 * pages, tiles and rows use `DeckFormatBadge` instead.
 */
export function FormatStateBadge({ format, isValid }: { format: string; isValid: boolean }) {
  const { labels: formatLabels } = useDeckFormatList();
  const formatLabel = formatLabels[format] ?? format;
  if (format === WellKnown.deckFormat.FREEFORM) {
    return (
      <Badge variant="outline" className="text-xs">
        {formatLabel}
      </Badge>
    );
  }
  if (isValid) {
    return (
      <Badge variant="outline" className="border-success/30 bg-success-soft text-success text-xs">
        <CheckIcon className="size-3" />
        {formatLabel}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-warning/40 bg-warning-soft text-warning text-xs">
      <CircleAlertIcon className="size-3" />
      {formatLabel}
    </Badge>
  );
}

/**
 * Deck's format badge with build state. One component for the deck page, grid
 * tile, and list row. Progress counts required zones only, excluding sideboard.
 */
export function DeckFormatBadge({
  format,
  totalCards,
  requiredProgress,
  requiredTotal,
  isValid,
  violations,
}: {
  format: string;
  totalCards: number;
  requiredProgress: number;
  requiredTotal: number;
  isValid: boolean;
  violations?: DeckViolation[];
}) {
  const { labels: formatLabels } = useDeckFormatList();
  const formatLabel = formatLabels[format] ?? format;
  const { kind, progress } = deckFormatBadgeState({
    format,
    totalCards,
    requiredProgress,
    requiredTotal,
    isValid,
  });

  if (kind === "draft") {
    return (
      <Badge variant="muted" className="rounded-md">
        {formatLabel} · Draft
      </Badge>
    );
  }

  if (kind === "invalid") {
    if (violations && violations.length > 0) {
      return (
        <ViolationBadge formatLabel={formatLabel} violations={violations} progress={progress} />
      );
    }
    return (
      <Badge variant="outline" className="border-warning/40 bg-warning-soft text-warning text-xs">
        {formatLabel}
        {progress && <span className="tabular-nums">· {progress}</span>}
        <CircleAlertIcon className="size-3" />
      </Badge>
    );
  }

  if (kind === "building") {
    return (
      <Badge variant="outline" className="text-xs">
        {formatLabel}
        <span className="tabular-nums">· {progress}</span>
      </Badge>
    );
  }

  return <FormatStateBadge format={format} isValid={isValid} />;
}

function formatStateText(
  formatLabel: string,
  kind: DeckFormatBadgeKind,
  progress?: string,
): string {
  if (kind === "draft") {
    return `${formatLabel} · Draft`;
  }
  if (progress) {
    return `${formatLabel} · ${progress}`;
  }
  return formatLabel;
}

function formatStateTone(kind: DeckFormatBadgeKind, isFreeform: boolean): string | undefined {
  if (kind === "invalid") {
    return "text-warning";
  }
  if (kind === "settled" && !isFreeform) {
    return "text-success";
  }
  return undefined;
}

/** Text-only twin of `DeckFormatBadge`, without the chip's border and padding. */
export function DeckFormatText({
  format,
  totalCards,
  requiredProgress,
  requiredTotal,
  isValid,
  className,
}: {
  format: string;
  totalCards: number;
  requiredProgress: number;
  requiredTotal: number;
  isValid: boolean;
  className?: string;
}) {
  const { labels: formatLabels } = useDeckFormatList();
  const formatLabel = formatLabels[format] ?? format;
  const { kind, progress } = deckFormatBadgeState({
    format,
    totalCards,
    requiredProgress,
    requiredTotal,
    isValid,
  });

  return (
    <span
      className={cn(
        "tabular-nums",
        formatStateTone(kind, format === WellKnown.deckFormat.FREEFORM),
        className,
      )}
    >
      {formatStateText(formatLabel, kind, progress)}
    </span>
  );
}
