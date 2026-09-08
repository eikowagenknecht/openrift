import { releasePostDate } from "@openrift/shared/printing-post-date";
import type { PostImageLabel } from "@openrift/shared/printing-post-image";
import type { SetRelease } from "@openrift/shared/set-release";
import { todayUtc } from "@openrift/shared/set-release";

export const POST_DATE_NONE = "none";

export function defaultPostDate(
  label: PostImageLabel,
  release: SetRelease | undefined,
  announcedAt: string | null | undefined,
  today: string = todayUtc(),
): string | undefined {
  if (label === "announced") {
    return announcedAt ?? today;
  }
  if (label !== "released") {
    return today;
  }
  return release === undefined ? undefined : releasePostDate(release);
}

export function effectivePostDate(
  dateParam: string | undefined,
  label: PostImageLabel,
  release: SetRelease | undefined,
  announcedAt: string | null | undefined,
  today?: string,
): string | undefined {
  if (dateParam === POST_DATE_NONE) {
    return undefined;
  }
  return dateParam ?? defaultPostDate(label, release, announcedAt, today);
}
