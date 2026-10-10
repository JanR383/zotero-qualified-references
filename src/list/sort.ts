import type { Stance } from "../modules/types";
import type { ListEntry, ListNode } from "./types";

/**
 * Row order and per-direction stance balance for the list window (L5, L6).
 * Pure functions, so they are unit-tested without opening the window.
 */

export type SortMode = "alpha" | "incoming" | "outgoing" | "year";

/**
 * Returns a sorted copy. "incoming"/"outgoing": most references in that
 * direction first; "year": oldest first, items without a year last. Ties fall
 * back to the label.
 */
export function sortNodes(nodes: ListNode[], mode: SortMode): ListNode[] {
  const byLabel = (a: ListNode, b: ListNode): number =>
    a.label.localeCompare(b.label);
  const compare: Record<SortMode, (a: ListNode, b: ListNode) => number> = {
    alpha: byLabel,
    incoming: (a, b) => b.incoming.length - a.incoming.length || byLabel(a, b),
    outgoing: (a, b) => b.outgoing.length - a.outgoing.length || byLabel(a, b),
    year: (a, b) =>
      (a.year ?? Infinity) - (b.year ?? Infinity) || byLabel(a, b),
  };
  return [...nodes].sort(compare[mode]);
}

/** Number of entries per stance; stances absent are 0. */
export function stanceCounts(entries: ListEntry[]): Record<Stance, number> {
  const counts: Record<Stance, number> = { 2: 0, 1: 0, 0: 0, [-1]: 0, [-2]: 0 };
  for (const e of entries) counts[e.stance]++;
  return counts;
}
