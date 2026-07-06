import { MinusIcon, PackageIcon, PlusIcon } from "lucide-react";
import type { ComponentType, MouseEvent, ReactNode, SVGProps } from "react";

import { Button } from "@/components/ui/button";
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
  /** Wider-scope total. When set and ≠ count, renders "×N (M)". */
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
 * Per-cell count strip rendered above the card image. Unified layout used by
 * the catalog (owned count + popover), collection add mode, list add mode,
 * list-entry editor, and public-share read-only view. Fixed h-5 + mb-1 = 24px
 * so the virtualizer row-height estimate stays consistent across surfaces.
 *
 * The deck editor uses `DeckAddStrip` instead — its "N owned / M in deck"
 * text layout and shift-click bulk semantics don't fit this shape.
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
  const hasButtons = Boolean(decrement || increment);

  const pillInner = (
    <>
      <Icon className="size-3" />
      <span>×{count}</span>
      {showTotal && <span className="opacity-60"> ({totalCount})</span>}
    </>
  );

  const pill =
    pillOverride ??
    (onPillClick ? (
      <CountPillButton
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
      <CountPill className={cn(isDim && "opacity-50")}>{pillInner}</CountPill>
    ));

  return (
    // ⚠ h-5 + mb-1 = 24px is mirrored as ADD_STRIP_HEIGHT in card-grid-constants — update both together
    <div
      className={cn(
        "relative z-30 mb-1 flex h-5 items-center",
        hasButtons ? "justify-between" : "justify-center",
      )}
    >
      {hasButtons &&
        (decrement ? (
          <StripIconButton {...decrement} icon={<MinusIcon />} />
        ) : (
          <span className="size-5" />
        ))}
      {extras ? (
        <div className="flex items-center gap-1">
          {pill}
          {extras}
        </div>
      ) : (
        pill
      )}
      {hasButtons &&
        (increment ? (
          <StripIconButton {...increment} icon={<PlusIcon />} />
        ) : (
          <span className="size-5" />
        ))}
    </div>
  );
}

function StripIconButton({
  onClick,
  disabled,
  ariaLabel,
  icon,
}: StripButtonSlot & { icon: ReactNode }) {
  return (
    <Button
      type="button"
      tabIndex={-1}
      size="icon-xs"
      variant="ghost"
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {icon}
    </Button>
  );
}
