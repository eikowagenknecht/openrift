import type { LucideIcon } from "lucide-react";

export type LockedFeatureKey =
  | "collections"
  | "scan"
  | "groups"
  | "loans"
  | "tournaments"
  | "tierLists"
  | "contribute";

export interface NavBadgeCounts {
  groups: number;
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
