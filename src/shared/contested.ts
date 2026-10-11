import type { Stance } from "../modules/types";

/**
 * "Contested" items (A1): cited with a positive stance and with a negative
 * one, by at least two different works (one work citing an item both ways
 * does not count). Pure, shared by the list and graph windows.
 */
export function isContested(
  incoming: readonly { id: number; stance: Stance }[],
): boolean {
  const pos = new Set<number>();
  const neg = new Set<number>();
  for (const e of incoming) {
    if (e.stance > 0) pos.add(e.id);
    else if (e.stance < 0) neg.add(e.id);
  }
  return pos.size > 0 && neg.size > 0 && new Set([...pos, ...neg]).size > 1;
}

/** The contested items among the targets of `links`. */
export function contestedIds(
  links: readonly { source: number; target: number; stance: Stance }[],
): Set<number> {
  const incoming = new Map<number, { id: number; stance: Stance }[]>();
  for (const l of links) {
    const list = incoming.get(l.target) ?? [];
    list.push({ id: l.source, stance: l.stance });
    incoming.set(l.target, list);
  }
  return new Set(
    [...incoming].filter(([, list]) => isContested(list)).map(([id]) => id),
  );
}
