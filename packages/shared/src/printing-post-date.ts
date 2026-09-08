import type { SetRelease } from "./set-release.js";

const YEAR_RE = /^\d{4}$/u;
const QUARTER_RE = /^\d{4}-Q[1-4]$/u;
const MONTH_RE = /^\d{4}-\d{2}$/u;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function postDateFromQuery(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (YEAR_RE.test(value) || QUARTER_RE.test(value)) {
    return value;
  }
  if (!MONTH_RE.test(value) && !DAY_RE.test(value)) {
    return undefined;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) {
    return undefined;
  }
  if (MONTH_RE.test(value)) {
    return value;
  }
  const day = Number(value.slice(8, 10));
  return day >= 1 && day <= daysInMonth(year, month) ? value : undefined;
}

export function isPostDayDate(value: string): boolean {
  return postDateFromQuery(value) !== undefined && DAY_RE.test(value);
}

export function formatPostDate(value: string): string {
  if (postDateFromQuery(value) === undefined) {
    return value;
  }
  const year = value.slice(0, 4);
  if (YEAR_RE.test(value)) {
    return year;
  }
  if (QUARTER_RE.test(value)) {
    return `${value.slice(5)} ${year}`;
  }
  const monthName = MONTH_NAMES[Number(value.slice(5, 7)) - 1];
  if (MONTH_RE.test(value)) {
    return `${monthName} ${year}`;
  }
  return `${Number(value.slice(8, 10))} ${monthName} ${year}`;
}

export function releasePostDate(release: SetRelease): string | undefined {
  const { releasedAt, precision } = release;
  if (!releasedAt || !precision) {
    return undefined;
  }
  const year = releasedAt.slice(0, 4);
  if (precision === "year") {
    return year;
  }
  if (precision === "quarter") {
    return `${year}-Q${Math.floor((Number(releasedAt.slice(5, 7)) - 1) / 3) + 1}`;
  }
  return precision === "month" ? releasedAt.slice(0, 7) : releasedAt.slice(0, 10);
}
