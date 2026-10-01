/**
 * Timeline layout for the graph window (G11): maps publication years to fixed
 * x positions (graph units) and picks readable axis ticks. Pure, so it is
 * unit-tested without force-graph.
 */

export interface TimeScale {
  /** x position for a year; undated items go to a lane right of the axis. */
  x(year: number | null): number;
  ticks: { x: number; year: number }[];
  /** x of the "undated" lane, or null when every item has a year. */
  undatedX: number | null;
}

const TARGET_WIDTH = 1000; // graph units spanned by the dated items
const MIN_PER_YEAR = 8;
const MAX_PER_YEAR = 120;
const MIN_TICK_GAP = 60; // graph units between axis ticks
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

export function timeScale(years: (number | null)[]): TimeScale {
  const dated = years.filter((y): y is number => y !== null);
  const hasUndated = dated.length < years.length;
  if (dated.length === 0) {
    return { x: () => 0, ticks: [], undatedX: hasUndated ? 0 : null };
  }
  const min = Math.min(...dated);
  const max = Math.max(...dated);
  const span = Math.max(1, max - min);
  const perYear = Math.min(
    MAX_PER_YEAR,
    Math.max(MIN_PER_YEAR, TARGET_WIDTH / span),
  );
  const mid = (min + max) / 2;
  const xOf = (year: number): number => (year - mid) * perYear;

  const step =
    TICK_STEPS.find((s) => s * perYear >= MIN_TICK_GAP) ??
    TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: { x: number; year: number }[] = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) {
    ticks.push({ x: xOf(y), year: y });
  }

  const undatedX = hasUndated
    ? xOf(max) + Math.max(2 * MIN_TICK_GAP, 2 * perYear)
    : null;
  return {
    x: (year) => (year === null ? (undatedX ?? 0) : xOf(year)),
    ticks,
    undatedX,
  };
}
