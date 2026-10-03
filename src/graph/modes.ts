/**
 * Positions for the ego-network and layered layouts of the graph window.
 * Pure, so they are unit-tested without force-graph.
 */

export interface DirectedLink {
  source: number; // citing item
  target: number; // cited item
}

export interface EgoPlace {
  x: number;
  y: number;
  /** 0 = centre, 1 = direct neighbour, 2 = neighbour of a neighbour. */
  level: 0 | 1 | 2;
}

/**
 * Ego network around `center`: items citing it on the left, items it cites
 * on the right, mutual references above and below it; neighbours of those
 * one column further out, on their neighbour's side. Each column is sorted
 * by `order` and centred vertically.
 */
export function egoLayout(
  center: number,
  links: DirectedLink[],
  spacing: { column: number; row: number },
  order: (a: number, b: number) => number,
): Map<number, EgoPlace> {
  const cites = new Set<number>(); // center → n
  const citedBy = new Set<number>(); // n → center
  for (const l of links) {
    if (l.source === l.target) continue;
    if (l.source === center) cites.add(l.target);
    if (l.target === center) citedBy.add(l.source);
  }
  // Side per item: -1 left, 0 middle, 1 right.
  const side = new Map<number, -1 | 0 | 1>();
  for (const n of new Set([...cites, ...citedBy])) {
    side.set(n, cites.has(n) && citedBy.has(n) ? 0 : cites.has(n) ? 1 : -1);
  }
  const outer = new Map<number, -1 | 1>();
  for (const l of links) {
    for (const [near, far] of [
      [l.source, l.target],
      [l.target, l.source],
    ]) {
      const s = side.get(near);
      if (s === undefined || far === center || side.has(far)) continue;
      if (outer.has(far)) continue;
      // Beside a mutual neighbour, follow the reference's direction.
      outer.set(far, s !== 0 ? s : far === l.source ? -1 : 1);
    }
  }

  const places = new Map<number, EgoPlace>();
  places.set(center, { x: 0, y: 0, level: 0 });
  const column = (ids: number[], x: number, level: 1 | 2): void => {
    ids.sort(order);
    ids.forEach((id, i) => {
      places.set(id, { x, y: (i - (ids.length - 1) / 2) * spacing.row, level });
    });
  };
  const pick = <T>(m: Map<number, T>, v: T): number[] =>
    [...m].filter(([, s]) => s === v).map(([id]) => id);
  column(pick(side, -1), -spacing.column, 1);
  column(pick(side, 1), spacing.column, 1);
  column(pick(outer, -1), -2 * spacing.column, 2);
  column(pick(outer, 1), 2 * spacing.column, 2);
  // Mutual neighbours alternate above and below the centre.
  pick(side, 0)
    .sort(order)
    .forEach((id, i) => {
      const step = Math.floor(i / 2) + 1;
      places.set(id, {
        x: 0,
        y: (i % 2 ? 1 : -1) * step * spacing.row,
        level: 1,
      });
    });
  return places;
}

/**
 * Layer per item for the layered layout: 0 for items that cite none of the
 * given items, otherwise one more than the highest layer they cite. Cycles
 * are broken at the reference that closes them (depth-first, in id order),
 * so every item gets a layer.
 */
export function layerLevels(
  ids: Iterable<number>,
  links: DirectedLink[],
): Map<number, number> {
  const nodes = [...new Set(ids)].sort((a, b) => a - b);
  const known = new Set(nodes);
  const out = new Map<number, number[]>(nodes.map((id) => [id, []]));
  for (const l of links) {
    if (l.source === l.target) continue;
    if (!known.has(l.source) || !known.has(l.target)) continue;
    out.get(l.source)!.push(l.target);
  }
  for (const targets of out.values()) targets.sort((a, b) => a - b);

  // Drop back edges (references closing a cycle).
  const state = new Map<number, 1 | 2>(); // 1 on the DFS path, 2 done
  const acyclic = new Map<number, number[]>(nodes.map((id) => [id, []]));
  const visit = (id: number): void => {
    state.set(id, 1);
    for (const t of out.get(id)!) {
      if (state.get(t) === 1) continue; // back edge
      acyclic.get(id)!.push(t);
      if (!state.has(t)) visit(t);
    }
    state.set(id, 2);
  };
  for (const id of nodes) if (!state.has(id)) visit(id);

  const level = new Map<number, number>();
  const levelOf = (id: number): number => {
    const cached = level.get(id);
    if (cached !== undefined) return cached;
    let l = 0;
    for (const t of acyclic.get(id)!) l = Math.max(l, levelOf(t) + 1);
    level.set(id, l);
    return l;
  };
  for (const id of nodes) levelOf(id);
  return level;
}
