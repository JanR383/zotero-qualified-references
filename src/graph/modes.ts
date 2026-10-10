/**
 * Positions for the ego-network layout of the graph window. Pure, so it is
 * unit-tested without force-graph.
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
 * a right one, mutual references at the top and bottom. When all direct
 * neighbours lie in one direction, they fill both half circles (clockwise
 * from the top). The outer ring holds only items linked to at least two
 * direct neighbours (what the neighbourhood has in common), next to those
 * neighbours. Each side runs top to bottom in `order`, evenly spaced in
 * height so that labels beside the items do not overlap; the rings grow so
 * that neighbouring items stay at least `gap` apart vertically.
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
  // Direct neighbours each outer candidate is linked to.
  const parents = new Map<number, Set<number>>();
  for (const l of links) {
    for (const [near, far] of [
      [l.source, l.target],
      [l.target, l.source],
    ]) {
      if (!side.has(near) || far === center || side.has(far)) continue;
      const set = parents.get(far);
      if (set) set.add(near);
      else parents.set(far, new Set([near]));
    }
  }
  const outer = [...parents].filter(([, p]) => p.size >= 2).map(([id]) => id);

  const pick = (s: -1 | 0 | 1): number[] =>
    [...side]
      .filter(([, v]) => v === s)
      .map(([id]) => id)
      .sort(order);
  let left = pick(-1);
  let right = pick(1);
  const mutual = pick(0);
  if (mutual.length === 0 && (left.length === 0 || right.length === 0)) {
    // One direction only: right half top to bottom, then left half bottom
    // to top.
    const all = left.length > 0 ? left : right;
    const half = Math.ceil(all.length / 2);
    right = all.slice(0, half);
    left = all.slice(half).reverse();
  }

  // Angle kept free around the top and bottom (for mutual references).
  const margin = mutual.length > 0 ? Math.PI / 6 : Math.PI / 12;
  const cap = 1.6 * margin; // angle for mutual references at one pole
  // Radius at which n items on one side are `gap` apart in height.
  const needSide = (n: number): number =>
    n > 1 ? (spacing.gap * (n - 1)) / (2 * Math.cos(margin)) : 0;
  const needCap = (n: number): number =>
    n > 1 ? (spacing.gap * (n - 1)) / cap : 0;

  const places = new Map<number, EgoPlace>();
  places.set(center, { x: 0, y: 0, level: 0 });
  // Items on one side, top to bottom, evenly spaced in height.
  const arc = (ids: number[], s: -1 | 1, r: number, level: 1 | 2): void => {
    ids.forEach((id, i) => {
      const t = ids.length === 1 ? 0.5 : i / (ids.length - 1);
      const y = (2 * t - 1) * r * Math.cos(margin);
      places.set(id, { x: s * Math.sqrt(r * r - y * y), y, level });
    });
  };

  const top = mutual.filter((_, i) => i % 2 === 0);
  const bottom = mutual.filter((_, i) => i % 2 === 1);
  const r1 = Math.max(
    spacing.ring,
    needSide(left.length),
    needSide(right.length),
    needCap(top.length),
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

  // Outer ring: beside the mean position of the neighbours they hang on.
  const anchor = new Map<number, { x: number; y: number }>();
  for (const id of outer) {
    const p = [...parents.get(id)!].map((n) => places.get(n)!);
    anchor.set(id, {
      x: p.reduce((sum, q) => sum + q.x, 0) / p.length,
      y: p.reduce((sum, q) => sum + q.y, 0) / p.length,
    });
  }
  const outerSide = (s: -1 | 1): number[] =>
    outer
      .filter((id) => (anchor.get(id)!.x < 0 ? -1 : 1) === s)
      .sort((a, b) => anchor.get(a)!.y - anchor.get(b)!.y || order(a, b));
  const outerLeft = outerSide(-1);
  const outerRight = outerSide(1);
  const r2 = Math.max(
    r1 + spacing.ring,
    needSide(outerLeft.length),
    needSide(outerRight.length),
  );
  arc(outerLeft, -1, r2, 2);
  arc(outerRight, 1, r2, 2);
  return places;
}
