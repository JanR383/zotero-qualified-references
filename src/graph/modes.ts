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
 * Ego network around `center`, laid out radially so it fills a window in
 * both directions: items citing it on a left half circle, items it cites on
 * a right one, mutual references at the top and bottom; neighbours of those
 * on an outer ring, on their neighbour's side and in their neighbour's
 * order. Each side runs top to bottom in `order`. The rings grow so that
 * neighbouring items stay at least `gap` apart along the ring.
 */
export function egoLayout(
  center: number,
  links: DirectedLink[],
  spacing: { ring: number; gap: number },
  order: (a: number, b: number) => number,
): Map<number, EgoPlace> {
  const cites = new Set<number>(); // center → n
  const citedBy = new Set<number>(); // n → center
  for (const l of links) {
    if (l.source === l.target) continue;
    if (l.source === center) cites.add(l.target);
    if (l.target === center) citedBy.add(l.source);
  }
  // Side per item: -1 left, 0 top/bottom, 1 right.
  const side = new Map<number, -1 | 0 | 1>();
  for (const n of new Set([...cites, ...citedBy])) {
    side.set(n, cites.has(n) && citedBy.has(n) ? 0 : cites.has(n) ? 1 : -1);
  }
  const outer = new Map<number, { side: -1 | 1; parent: number }>();
  for (const l of links) {
    for (const [near, far] of [
      [l.source, l.target],
      [l.target, l.source],
    ]) {
      const s = side.get(near);
      if (s === undefined || far === center || side.has(far)) continue;
      if (outer.has(far)) continue;
      // Beside a mutual neighbour, follow the reference's direction.
      const o = s !== 0 ? s : far === l.source ? -1 : 1;
      outer.set(far, { side: o, parent: near });
    }
  }

  const pick = (s: -1 | 0 | 1): number[] =>
    [...side]
      .filter(([, v]) => v === s)
      .map(([id]) => id)
      .sort(order);
  const left = pick(-1);
  const right = pick(1);
  const mutual = pick(0);
  // Angle kept free around the top and bottom (for mutual references).
  const margin = mutual.length > 0 ? Math.PI / 6 : Math.PI / 12;
  const span = Math.PI - 2 * margin; // angle per side, top to bottom
  const cap = 1.6 * margin; // angle for mutual references at one pole
  const need = (n: number, angle: number): number =>
    n > 1 ? (spacing.gap * (n - 1)) / angle : 0;

  const places = new Map<number, EgoPlace>();
  places.set(center, { x: 0, y: 0, level: 0 });
  // Items on one side, top to bottom; angle 0 points sideways.
  const arc = (ids: number[], s: -1 | 1, r: number, level: 1 | 2): void => {
    ids.forEach((id, i) => {
      const t = ids.length === 1 ? 0.5 : i / (ids.length - 1);
      const a = -Math.PI / 2 + margin + t * span;
      places.set(id, { x: s * r * Math.cos(a), y: r * Math.sin(a), level });
    });
  };

  const top = mutual.filter((_, i) => i % 2 === 0);
  const bottom = mutual.filter((_, i) => i % 2 === 1);
  const r1 = Math.max(
    spacing.ring,
    need(left.length, span),
    need(right.length, span),
    need(top.length, cap),
  );
  arc(left, -1, r1, 1);
  arc(right, 1, r1, 1);
  for (const [ids, pole] of [
    [top, -1],
    [bottom, 1],
  ] as const) {
    ids.forEach((id, i) => {
      const t = ids.length === 1 ? 0 : i / (ids.length - 1) - 0.5;
      const a = pole * (Math.PI / 2) + t * cap;
      places.set(id, { x: r1 * Math.cos(a), y: r1 * Math.sin(a), level: 1 });
    });
  }

  // Outer ring: grouped by the position of the neighbour they hang on.
  const outerSide = (s: -1 | 1): number[] =>
    [...outer]
      .filter(([, o]) => o.side === s)
      .map(([id]) => id)
      .sort(
        (a, b) =>
          places.get(outer.get(a)!.parent)!.y -
            places.get(outer.get(b)!.parent)!.y || order(a, b),
      );
  const outerLeft = outerSide(-1);
  const outerRight = outerSide(1);
  const r2 = Math.max(
    r1 + spacing.ring,
    need(outerLeft.length, span),
    need(outerRight.length, span),
  );
  arc(outerLeft, -1, r2, 2);
  arc(outerRight, 1, r2, 2);
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
