import type { Stance } from "../modules/types";
import type { ListNode } from "./types";

/**
 * Client-side filtering for the list window (L2 search, L3 stance filter).
 * Pure function, so it is unit-tested without opening the window.
 *
 * - Entries whose stance is not in `stances` are dropped; a node left without
 *   any entries is dropped too.
 * - `query` is split on whitespace; a node matches when its label (author,
 *   year, title as formatted by the plugin) contains every term,
 *   case-insensitively. An empty query matches every node.
 */
export function filterNodes(
  nodes: ListNode[],
  query: string,
  stances: ReadonlySet<Stance>,
): ListNode[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const result: ListNode[] = [];
  for (const node of nodes) {
    const label = node.label.toLocaleLowerCase();
    if (!terms.every((t) => label.includes(t))) continue;
    const outgoing = node.outgoing.filter((e) => stances.has(e.stance));
    const incoming = node.incoming.filter((e) => stances.has(e.stance));
    if (outgoing.length + incoming.length === 0) continue;
    result.push({ ...node, outgoing, incoming });
  }
  return result;
}
