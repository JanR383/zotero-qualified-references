import type { Stance } from "../modules/types";
import type { ListEntry, ListNode } from "./types";

/**
 * Client-side filtering for the list window (L2 search, L3 stance filter,
 * selection). Pure functions, so they are unit-tested without opening the
 * window.
 */

/**
 * Which items the list shows: all; items with outgoing references ("I have
 * evaluated it"); items without ("only cited"); items cited as supporting by
 * one work and as contradicting by another ("mixed"); items cited by at least
 * UNEVALUATED_MIN works but without references of their own.
 */
export type ShowMode = "all" | "evaluated" | "cited" | "mixed" | "unevaluated";

export const UNEVALUATED_MIN = 3;

/** Distinct items an entry list points at. */
const distinctIds = (entries: ListEntry[]): Set<number> =>
  new Set(entries.map((e) => e.id));

/**
 * The item is cited with a positive stance and with a negative one, by at
 * least two different works (one work citing it both ways does not count).
 */
export function isMixed(node: ListNode): boolean {
  const pos = distinctIds(node.incoming.filter((e) => e.stance > 0));
  const neg = distinctIds(node.incoming.filter((e) => e.stance < 0));
  return pos.size > 0 && neg.size > 0 && new Set([...pos, ...neg]).size > 1;
}

function shows(node: ListNode, mode: ShowMode): boolean {
  switch (mode) {
    case "evaluated":
      return node.outgoing.length > 0;
    case "cited":
      return node.outgoing.length === 0;
    case "mixed":
      return isMixed(node);
    case "unevaluated":
      return (
        node.outgoing.length === 0 &&
        distinctIds(node.incoming).size >= UNEVALUATED_MIN
      );
    default:
      return true;
  }
}

/** Lower-cased search terms of a query; [] for an empty one. */
export function searchTerms(query: string): string[] {
  return query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

/** Whether a comment contains any of the terms (to show it unfolded). */
export function commentMatches(
  comment: string | undefined,
  terms: string[],
): boolean {
  if (!comment || terms.length === 0) return false;
  const text = comment.toLocaleLowerCase();
  return terms.some((t) => text.includes(t));
}

/**
 * - `mode` is decided on the unfiltered node: it describes the item, not the
 *   stances currently shown.
 * - Entries whose stance is not in `stances` are dropped; a node left without
 *   any entries is dropped too.
 * - `query` is split on whitespace; a node matches when every term occurs in
 *   its label (author, year, title as formatted by the plugin) or in the
 *   comment of one of its references, case-insensitively. An empty query
 *   matches every node.
 */
export function filterNodes(
  nodes: ListNode[],
  query: string,
  stances: ReadonlySet<Stance>,
  mode: ShowMode = "all",
): ListNode[] {
  const terms = searchTerms(query);
  const result: ListNode[] = [];
  for (const node of nodes) {
    if (!shows(node, mode)) continue;
    if (terms.length > 0) {
      const text = [
        node.label,
        ...node.outgoing.map((e) => e.comment ?? ""),
        ...node.incoming.map((e) => e.comment ?? ""),
      ]
        .join("\n")
        .toLocaleLowerCase();
      if (!terms.every((t) => text.includes(t))) continue;
    }
    const outgoing = node.outgoing.filter((e) => stances.has(e.stance));
    const incoming = node.incoming.filter((e) => stances.has(e.stance));
    if (outgoing.length + incoming.length === 0) continue;
    result.push({ ...node, outgoing, incoming });
  }
  return result;
}
