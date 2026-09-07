interface StaticCountTableActionsProps {
  count: number;
}

export function StaticCountTableActions({ count }: StaticCountTableActionsProps) {
  return count > 0 ? `×${count}` : "";
}
