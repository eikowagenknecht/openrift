import { MinusIcon, PackageIcon, PlusIcon } from "lucide-react";
import type { ComponentType, MouseEvent, ReactNode, SVGProps } from "react";

import { CardStrip, StripIconButton } from "@/components/cards/card-strip";
import { CountPill, CountPillButton } from "@/components/ui/count-pill";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface StripButtonSlot {
  /** Receives the click event so callers can derive an anchor element (e.g., popover anchor) from `event.currentTarget`. */
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  ariaLabel: string;
}

interface CardCountStripProps {
  /** Count drives the default pill. Ignored when `pillOverride` is supplied. */
  count: number;
  /** Icon inside the default pill. */
  icon?: IconComponent;
  /** Wider-scope total. When set and ≠ count, renders "N (M)". */
  totalCount?: number;
  /** Force the pill's dimmed state. Defaults to true when count is 0 and no total diverges. */
  dim?: boolean;
  /** When set, the default pill becomes a button (used by the variant chooser). Ignored when `pillOverride` is set. */
  onPillClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Required when `onPillClick` is set. */
  pillAriaLabel?: string;
  /** Replace the pill entirely — for popover triggers that own their styling (e.g. owned-collections breakdown). */
  pillOverride?: ReactNode;
  /** Decrement button on the left. Omit for read-only displays. */
  decrement?: StripButtonSlot;
  /** Increment button on the right. Omit for read-only displays. */
  increment?: StripButtonSlot;
  /** Optional sibling pill rendered next to the count pill, centered as a group between the buttons. Used by lists for the trade-pref pill. */
  extras?: ReactNode;
}

/**
 * Count preset over the CardStrip shell: the icon + count pill (bare number,
 * no "×" prefix — the icon carries the meaning) with optional ± steppers.
 * Used by the catalog (owned count + popover), collection add mode, list add
 * mode, list-entry editor, and public-share read-only view.
 *
 * The deck editor uses `DeckAddStrip` instead — its owned / in-deck pill pair
 * and shift-click bulk semantics don't fit this shape.
 *
 * @returns The card-count strip.
 */
export function CardCountStrip({
  count,
  icon: Icon = PackageIcon,
  totalCount,
  dim,
  onPillClick,
  pillAriaLabel,
  pillOverride,
  decrement,
  increment,
  extras,
}: CardCountStripProps) {
  const showTotal = totalCount !== undefined && totalCount !== count;
  const isDim = dim ?? (count === 0 && !showTotal);

  const pillInner = (
    <>
      <Icon className="size-3" />
      <span>{count}</span>
      {showTotal && <span className="opacity-60"> ({totalCount})</span>}
    </>
  );

  const pill =
    pillOverride ??
    (onPillClick ? (
      <CountPillButton
        variant="ghost"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          onPillClick(event);
        }}
        aria-label={pillAriaLabel}
        className={cn(isDim && "opacity-50")}
      >
        {pillInner}
      </CountPillButton>
    ) : (
      <CountPill variant="ghost" className={cn(isDim && "opacity-50")}>
        {pillInner}
      </CountPill>
    ));

  return (
    <CardStrip
      left={
        decrement && (
          <StripIconButton
            onClick={(event) => decrement.onClick(event)}
            disabled={decrement.disabled}
            aria-label={decrement.ariaLabel}
          >
            <MinusIcon />
          </StripIconButton>
        )
      }
      center={
        <>
          {pill}
          {extras}
        </>
      }
      right={
        increment && (
          <StripIconButton
            onClick={(event) => increment.onClick(event)}
            disabled={increment.disabled}
            aria-label={increment.ariaLabel}
          >
            <PlusIcon />
          </StripIconButton>
        )
      }
    />
  );
}
