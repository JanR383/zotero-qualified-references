import type { Stance } from "../modules/types";
import type { ListNode } from "./types";

/**
 * Row order and per-row stance balance for the list window (L5, L6).
 * Pure functions, so they are unit-tested without opening the window.
 */

export type SortMode = "alpha" | "count" | "year";

const entryCount = (n: ListNode): number =>
  n.outgoing.length + n.incoming.length;

/**
 * Returns a sorted copy. "count": most references first; "year": oldest first,
 * items without a year last. Ties fall back to the label.
 */
export function sortNodes(nodes: ListNode[], mode: SortMode): ListNode[] {
  const byLabel = (a: ListNode, b: ListNode): number =>
    a.label.localeCompare(b.label);
  const compare: Record<SortMode, (a: ListNode, b: ListNode) => number> = {
    alpha: byLabel,
    count: (a, b) => entryCount(b) - entryCount(a) || byLabel(a, b),
    year: (a, b) =>
      (a.year ?? Infinity) - (b.year ?? Infinity) || byLabel(a, b),
  };
  return [...nodes].sort(compare[mode]);
}

/** Number of entries (outgoing + incoming) per stance; stances absent are 0. */
export function stanceCounts(node: ListNode): Record<Stance, number> {
  const counts: Record<Stance, number> = { 2: 0, 1: 0, 0: 0, [-1]: 0, [-2]: 0 };
  for (const e of node.outgoing) counts[e.stance]++;
  for (const e of node.incoming) counts[e.stance]++;
  return counts;
}
