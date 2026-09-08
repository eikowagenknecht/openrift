import type { AdminSignupDay } from "@openrift/shared/contracts/admin/dashboard";

export const USER_GROWTH_RANGES = ["30d", "90d", "all"] as const;

export type UserGrowthRange = (typeof USER_GROWTH_RANGES)[number];

export const USER_GROWTH_RANGE_LABELS: Record<UserGrowthRange, string> = {
  "30d": "30D",
  "90d": "90D",
  all: "All",
};

const RANGE_DAYS: Record<UserGrowthRange, number | null> = { "30d": 30, "90d": 90, all: null };

export interface UserGrowthPoint {
  date: string;
  users: number;
  signups: number;
}

/** Sums the whole series before slicing, so a windowed view still starts at the real total. */
export function toUserGrowthSeries(
  signups: AdminSignupDay[],
  range: UserGrowthRange,
): UserGrowthPoint[] {
  let users = 0;
  const cumulative = signups.map((day) => {
    users += day.count;
    return { date: day.date, users, signups: day.count };
  });

  const days = RANGE_DAYS[range];
  return days === null ? cumulative : cumulative.slice(-days);
}

export function countSignups(series: UserGrowthPoint[]): number {
  return series.reduce((total, point) => total + point.signups, 0);
}
