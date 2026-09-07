export interface Seat {
  id: string;
  rotated: boolean;
}

/**
 * The first half of the roster sits on the far side of the table, rotated
 * 180°. Portrait stacks everyone into one column, far-side first and
 * reversed, so the seating still reads clockwise (four players → B A C D).
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

const ROW_GAP = 8;

export function perRowHeight(boardHeight: number, rowCount: number): number {
  if (rowCount <= 0 || boardHeight <= 0) {
    return 0;
  }
  return (boardHeight - ROW_GAP * (rowCount - 1)) / rowCount;
}

/** The match score is the one place the type scale extends past `text-5xl` (docs/typography.md). */
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

export type MedallionSize = "sm" | "md" | "lg";

/**
 * The three medallions compete with the score for height; a four-player
 * board drops to the small tier and hides their labels.
 */
export function medallionSizeTier(panelHeight: number): MedallionSize {
  if (panelHeight >= 300) {
    return "lg";
  }
  if (panelHeight >= 190) {
    return "md";
  }
  return "sm";
}

export type XpSize = "sm" | "md" | "lg" | "xl";

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
