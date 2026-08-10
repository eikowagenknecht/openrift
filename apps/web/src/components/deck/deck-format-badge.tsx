import type { DeckViolation } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { CheckIcon, CircleAlertIcon } from "lucide-react";

import { ViolationBadge } from "@/components/deck/deck-validation-banner";
import { Badge } from "@/components/ui/badge";
import { useDeckFormatList } from "@/hooks/use-enums";
import type { DeckFormatBadgeKind } from "@/lib/deck-format-badge-state";
import { deckFormatBadgeState } from "@/lib/deck-format-badge-state";
import { cn } from "@/lib/utils";

/**
 * The two-state format badge: plain for Freeform, green check when the deck
 * passes its format's rules, amber alert otherwise. Used where there is no
 * build figure to show (the deck-check surfaces). Deck pages, tiles and rows
 * go through `DeckFormatBadge`, which adds the draft and progress states.
 * @returns The badge element.
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
      <Badge
        variant="outline"
        className="border-green-600/30 bg-green-600/10 text-xs text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400"
      >
        <CheckIcon className="size-3" />
        {formatLabel}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-600/30 bg-amber-600/10 text-xs text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
    >
      <CircleAlertIcon className="size-3" />
      {formatLabel}
    </Badge>
  );
}

/**
 * The deck's format badge, carrying its build state. One component for the
 * deck page, the grid tile and the list row, so a deck's status reads the same
 * wherever you meet it. The states, in order:
 *
 * 1. an empty non-Freeform deck reads as a draft, not as a failure;
 * 2. a deck that breaks its format's rules shows amber with the figure, and
 *    opens the violation list when the caller has the detail;
 * 3. an incomplete deck shows the figure plainly, which is what keeps Freeform
 *    and Custom-Region decks (never reported invalid by the list endpoint)
 *    from losing their card count entirely;
 * 4. a complete deck shows its format alone, with a check where the format has
 *    rules to pass.
 *
 * The figure counts the format's required zones and excludes the sideboard, so
 * it is deliberately not the deck's total card count.
 * @returns The badge element.
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
  /** Pass/fail, for callers with no violation detail (the deck list). */
  isValid: boolean;
  /** Full detail where the caller has it, which turns the badge into a popover. */
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
      <Badge
        variant="outline"
        className="border-amber-600/30 bg-amber-600/10 text-xs text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
      >
        {formatLabel}
        {progress && <span className="tabular-nums">· {progress}</span>}
        <CircleAlertIcon className="size-3" />
      </Badge>
    );
  }

  // Still building: the figure rather than a check, which would claim more
  // than the list endpoint actually verified for these formats.
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

/**
 * Text for the state, keeping the figure where there is one.
 * @returns The label with its figure or draft marker.
 */
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

/**
 * Colour for the state, dropped to inherited muted where there's nothing to say.
 * @returns The colour classes, or undefined to inherit.
 */
function formatStateTone(kind: DeckFormatBadgeKind, isFreeform: boolean): string | undefined {
  if (kind === "invalid") {
    return "text-amber-600 dark:text-amber-500";
  }
  if (kind === "settled" && !isFreeform) {
    return "text-green-600 dark:text-green-500";
  }
  return undefined;
}

/**
 * The badge's text-only twin, for the dense list rows: the same states from the
 * same function, but without the chip's border and padding, so the row spends
 * its width on the deck name instead. Colour carries what the icons carry on
 * the badge — amber for a deck that breaks its format, green for one that
 * passes.
 * @returns The state as a plain span.
 */
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
