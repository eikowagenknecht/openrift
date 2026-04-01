import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function StatChip({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
          {icon && <img src={icon} alt="" className="size-3.5 brightness-0 dark:invert" />}
          <span className="text-muted-foreground text-xs font-normal">{label}</span>
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
