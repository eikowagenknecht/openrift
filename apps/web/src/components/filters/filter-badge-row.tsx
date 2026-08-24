import { MinusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CardIcon } from "@/components/card-icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function FilterSection({
  label,
  options,
  selected,
  excluded,
  onToggle,
  onCycle,
  iconPath,
  displayLabel,
  secondaryOptions,
  counts,
  wide,
  children,
  trailing,
}: {
  label: string;
  children?: ReactNode;
  options?: string[];
  selected?: string[];
  excluded?: string[];
  onToggle?: (value: string) => void;
  onCycle?: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
  secondaryOptions?: ReadonlySet<string>;
  counts?: Map<string, number>;
  /** Span the full row in any multi-column parent grid. */
  wide?: boolean;
  /** Extra control(s) appended after the badges (e.g. the Signed flag in Art Variant). */
  trailing?: ReactNode;
}) {
  if (!children && !trailing && (!options || options.length === 0)) {
    return null;
  }

  return (
    <div className={cn("flex min-w-0 gap-2", wide && "lg:col-span-2")}>
      <p className="text-muted-foreground w-18 text-xs font-medium">{label}</p>
      {children ? (
        <div className="flex flex-1 flex-wrap gap-1">{children}</div>
      ) : (
        <FilterBadgeGrid
          options={options ?? []}
          selected={selected}
          excluded={excluded}
          onToggle={onToggle}
          onCycle={onCycle}
          iconPath={iconPath}
          displayLabel={displayLabel}
          secondaryOptions={secondaryOptions}
          counts={counts}
          trailing={trailing}
        />
      )}
    </div>
  );
}

/**
 * The wrapping row of toggleable filter badges for one dimension — icon +
 * label + faceted count, with selected/secondary/zero-count styling. Shared by
 * the expanded `FilterSection` and the compact bar's dropdown-chip popovers so
 * both render identical badges.
 * @returns The badge row.
 */
export function FilterBadgeGrid({
  options,
  selected,
  excluded,
  onToggle,
  onCycle,
  iconPath,
  displayLabel,
  secondaryOptions,
  counts,
  className,
  trailing,
}: {
  options: string[];
  selected?: string[];
  /** Values in this dimension's exclude (`*Ex`) array; rendered struck-out. */
  excluded?: string[];
  onToggle?: (value: string) => void;
  /**
   * Tri-state click handler (off → include → exclude → off). When provided it
   * replaces `onToggle`, turning each badge into a cycling include/exclude
   * control (ADR-034). Pass `excluded` alongside it for the exclude styling.
   */
  onCycle?: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
  secondaryOptions?: ReadonlySet<string>;
  counts?: Map<string, number>;
  className?: string;
  /** Extra control(s) rendered inline after the badges (e.g. the Signed flag in Art Variant). */
  trailing?: ReactNode;
}) {
  // A value can be selected (or excluded) while it was still an available
  // option, then drop out of `options` when the available set narrows (e.g.
  // switching to owned-only). It keeps filtering either way, so keep it
  // visible — appended after the real options — instead of letting it vanish
  // from the panel with no way to toggle it off. Matches the combobox
  // sections, which already keep orphaned selections visible.
  const orphaned = [...(selected ?? []), ...(excluded ?? [])].filter(
    (value, index, all) => !options.includes(value) && all.indexOf(value) === index,
  );
  const renderedOptions = orphaned.length > 0 ? [...options, ...orphaned] : options;

  return (
    <div className={cn("flex flex-1 flex-wrap gap-1", className)}>
      {renderedOptions.map((option) => {
        const icon = iconPath?.(option);
        const isSelected = selected?.includes(option);
        const isExcluded = excluded?.includes(option);
        const isSecondary = secondaryOptions?.has(option);
        const count = counts?.get(option);
        const isZero = counts !== undefined && (count ?? 0) === 0;
        return (
          <Badge
            key={option}
            variant={!icon && isSelected ? "default" : "outline"}
            className={cn(
              "cursor-pointer",
              icon && "pr-0",
              // Excluded badges read as a struck-out "not this" in destructive
              // tint, distinct from an included badge's solid fill.
              !icon && isExcluded && "border-destructive/40 text-destructive line-through",
              isSecondary && !isSelected && !isExcluded && "opacity-65",
              isZero && !isSelected && !isExcluded && "opacity-40",
            )}
            onClick={() => (onCycle ? onCycle(option) : onToggle?.(option))}
          >
            {!icon && isExcluded && <MinusIcon className="size-3" />}
            {icon && <CardIcon src={icon} />}
            <span
              className={cn(
                icon && "-my-0.5 inline-flex h-5 items-center rounded-full px-2",
                icon && isSelected && "bg-primary text-primary-foreground",
                icon && isExcluded && "bg-destructive text-white line-through",
              )}
            >
              {displayLabel ? displayLabel(option) : option}
              {count !== undefined && <span className="ml-1 tabular-nums opacity-60">{count}</span>}
            </span>
          </Badge>
        );
      })}
      {trailing}
    </div>
  );
}
