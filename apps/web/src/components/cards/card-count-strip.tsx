import { MinusIcon, PackageIcon, PlusIcon } from "lucide-react";
import type { ComponentType, MouseEvent, ReactNode, SVGProps } from "react";

import { CardStrip, StripIconButton } from "@/components/cards/card-strip";
import { CountPill, CountPillButton } from "@/components/ui/count-pill";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface StripButtonSlot {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  ariaLabel: string;
}

interface CardCountStripProps {
  count: number;
  icon?: IconComponent;
  totalCount?: number;
  dim?: boolean;
  onPillClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  pillAriaLabel?: string;
  pillOverride?: ReactNode;
  decrement?: StripButtonSlot;
  increment?: StripButtonSlot;
  extras?: ReactNode;
}

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
