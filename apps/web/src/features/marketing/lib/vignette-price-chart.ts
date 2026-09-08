export interface VignettePriceSource {
  price: number;
  phase: number;
  swing: number;
  rate: number;
}

export const PRICE_SAMPLE_COUNT = 12;
// Fixed: using today's date would mismatch between server and client renders.
const PRICE_END_DAY = Date.parse("2026-08-24T00:00:00Z");

const TICK_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25];

// No randomness: output must match between server and client renders.
export function priceSeries(source: VignettePriceSource, days: number): number[] {
  const drift = source.price * source.rate * Math.sqrt(days);
  const raw = Array.from({ length: PRICE_SAMPLE_COUNT }, (_, index) => {
    const t = index / (PRICE_SAMPLE_COUNT - 1);
    const wobble = Math.sin(source.phase + t * 7.5) + 0.5 * Math.sin(source.phase * 1.7 + t * 17.3);
    return source.price - drift * (1 - t) + source.price * 0.012 * source.swing * wobble;
  });
  // oxlint-disable-next-line no-non-null-assertion -- PRICE_SAMPLE_COUNT is a positive literal
  const shift = source.price - raw.at(-1)!;
  return raw.map((value) => value + shift);
}

export function tickStep(min: number, max: number): number {
  return TICK_STEPS.find((step) => Math.ceil(max / step) * step - 2 * step <= min) ?? 50;
}

export function chartDay(daysAgo: number): string {
  return new Date(PRICE_END_DAY - daysAgo * 86_400_000).toISOString().slice(0, 10);
}
