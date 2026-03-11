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
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-sm font-semibold"
    >
      {icon && <img src={icon} alt="" className="size-3.5 brightness-0 dark:invert" />}
      <span className="text-xs font-normal text-muted-foreground">{label}</span>
      {value}
    </span>
  );
}
