import type { LucideIcon } from "lucide-react";

export type LockedFeatureKey =
  | "collections"
  | "scan"
  | "groups"
  | "trades"
  | "loans"
  | "tournaments"
  | "tierLists"
  | "contribute";

export interface NavBadgeCounts {
  groups: number;
  trades: number;
  loans: number;
}

export interface NavItemConfig {
  label: string;
  to: string;
  icon: LucideIcon;
  description?: string;
  keepSearch?: boolean;
  lockedKey?: LockedFeatureKey;
  badge?: keyof NavBadgeCounts;
  flag?: "glossary" | "meta";
  platform?: "mobile" | "desktop";
}
