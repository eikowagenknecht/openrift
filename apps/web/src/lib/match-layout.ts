export interface Seat {
  id: string;
  /** Rotated 180° so a player seated on the far side of the table reads it upright. */
  rotated: boolean;
}

/**
 * Arrange the players around the phone for the match board.
 *
 * The first half of the roster always sits on the far side of the table and is
 * rotated 180°. Landscape keeps a two-row grid; portrait stacks everyone into a
 * single column so two panels never have to share a narrow phone width. In
 * portrait the far-side players come first, reversed so the seating still reads
 * clockwise (e.g. four players → B A C D top to bottom).
 * @returns Rows of seats, top to bottom; each row lays its seats left to right.
 */
export function planSeats(ids: string[], isLandscape: boolean): Seat[][] {
  const topCount = Math.floor(ids.length / 2);
  const topIds = ids.slice(0, topCount);
  const bottomIds = ids.slice(topCount);

  if (isLandscape) {
    const rows: Seat[][] = [];
    if (topIds.length > 0) {
      rows.push(topIds.map((id) => ({ id, rotated: true })));
    }
    rows.push(bottomIds.toReversed().map((id) => ({ id, rotated: false })));
    return rows;
  }

  const column: Seat[] = [
    ...topIds.toReversed().map((id) => ({ id, rotated: true })),
    ...bottomIds.map((id) => ({ id, rotated: false })),
  ];
  return column.map((seat) => [seat]);
}

/** Gap (px) between board rows; mirrors the `gap-2` in the board layout. */
const ROW_GAP = 8;

/**
 * Height (px) one panel gets, given the measured board height split across its
 * rows. Drives how large the score can be.
 * @returns The per-row pixel height, or 0 when nothing has been measured yet.
 */
export function perRowHeight(boardHeight: number, rowCount: number): number {
  if (rowCount <= 0 || boardHeight <= 0) {
    return 0;
  }
  return (boardHeight - ROW_GAP * (rowCount - 1)) / rowCount;
}

/**
 * Pick the Tailwind text size for the score so it grows on tall cards and
 * shrinks to fit short ones. The match score is a display numeral and is the
 * one place the type scale extends past `text-5xl` (see docs/typography.md).
 * @returns A `text-*` class from `text-4xl` up to `text-9xl`.
 */
export function scoreSizeClass(panelHeight: number): string {
  if (panelHeight >= 380) {
    return "text-9xl";
  }
  if (panelHeight >= 290) {
    return "text-8xl";
  }
  if (panelHeight >= 220) {
    return "text-7xl";
  }
  if (panelHeight >= 165) {
    return "text-6xl";
  }
  if (panelHeight >= 128) {
    return "text-5xl";
  }
  return "text-4xl";
}

export type XpSize = "sm" | "md" | "lg" | "xl";

/**
 * Pick an XP-cluster size tier that scales with the panel height, roughly
 * tracking the score: small on cramped phone cards, about double on a
 * two-player board, larger still on a big desktop window.
 * @returns The XP size tier for the given per-panel height.
 */
export function xpSizeTier(panelHeight: number): XpSize {
  if (panelHeight >= 320) {
    return "xl";
  }
  if (panelHeight >= 210) {
    return "lg";
  }
  if (panelHeight >= 145) {
    return "md";
  }
  return "sm";
}
