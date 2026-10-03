/**
 * Network layout helpers for the graph window: keeps clusters that are not
 * connected to each other apart. force-graph's default forces only repel
 * nodes weakly, so separate clusters stay mixed into one tangle. These
 * forces work on plain {x, y, vx, vy} objects and are unit-tested without
 * force-graph.
 */

const COLLIDE_STRENGTH = 0.7; // d3's forceCollide default
const SEPARATE_STRENGTH = 0.5; // share of a cluster overlap removed per tick

export interface LayoutNode {
  id: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

/** Connected components (undirected) of the given nodes, largest first. */
export function components(
  ids: Iterable<number>,
  links: Iterable<{ source: number; target: number }>,
): number[][] {
  const parent = new Map<number, number>();
  for (const id of ids) parent.set(id, id);
  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression.
    while (parent.get(id) !== root) {
      const next = parent.get(id)!;
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  for (const l of links) {
    if (!parent.has(l.source) || !parent.has(l.target)) continue;
    parent.set(find(l.source), find(l.target));
  }
  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const g = groups.get(root);
    if (g) g.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/**
 * A d3-style force that treats each cluster as a disc around its centroid:
 * overlapping discs are pushed apart (at least `gap` between their rims),
 * and every cluster is pulled gently towards the origin so they pack instead
 * of drifting off. Within a cluster, nodes closer than their radii plus
 * `spacing` are pushed apart, so edges keep a readable length. Nodes not in
 * any group are left alone.
 */
export function clusterForce(options: {
  /** Space between cluster rims, graph units. */
  gap: () => number;
  /** Room around each node (its drawn radius), graph units. */
  nodeRadius: (n: LayoutNode) => number;
  /** Extra space between two nodes of a cluster, graph units. */
  spacing: () => number;
  /** Pull towards the origin per tick, scaled by alpha. */
  gravity?: number;
}): ((alpha: number) => void) & {
  initialize: (nodes: LayoutNode[]) => void;
  groups: (groups: number[][]) => void;
} {
  const gravity = options.gravity ?? 0.05;
  let byId = new Map<number, LayoutNode>();
  let groups: number[][] = [];
  let members: LayoutNode[][] = [];
  const resolve = (): void => {
    members = groups
      .map((g) => g.map((id) => byId.get(id)).filter((n) => !!n))
      .filter((g) => g.length > 0);
  };

  const force = (alpha: number): void => {
    if (members.length === 0) return;
    const gap = options.gap();
    const spacing = options.spacing();

    // Node collision inside each cluster (like d3's forceCollide, not scaled
    // by alpha). Clusters are kept apart below, so pairs across clusters
    // need no check.
    for (const ns of members) {
      for (let i = 0; i < ns.length; i++) {
        const a = ns[i];
        const ra = options.nodeRadius(a);
        for (let j = i + 1; j < ns.length; j++) {
          const b = ns[j];
          const need = ra + options.nodeRadius(b) + spacing;
          let dx = (b.x ?? 0) + (b.vx ?? 0) - (a.x ?? 0) - (a.vx ?? 0);
          let dy = (b.y ?? 0) + (b.vy ?? 0) - (a.y ?? 0) - (a.vy ?? 0);
          let d = Math.hypot(dx, dy);
          if (d >= need) continue;
          if (d < 1e-6) {
            const angle = (i * 7 + j) * 2.399963;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            d = 1;
          }
          const push = ((need - d) / d) * COLLIDE_STRENGTH * 0.5;
          a.vx = (a.vx ?? 0) - dx * push;
          a.vy = (a.vy ?? 0) - dy * push;
          b.vx = (b.vx ?? 0) + dx * push;
          b.vy = (b.vy ?? 0) + dy * push;
        }
      }
    }

    const discs = members.map((ns) => {
      let cx = 0;
      let cy = 0;
      for (const n of ns) {
        cx += n.x ?? 0;
        cy += n.y ?? 0;
      }
      cx /= ns.length;
      cy /= ns.length;
      let r = 0;
      for (const n of ns) {
        const d = Math.hypot((n.x ?? 0) - cx, (n.y ?? 0) - cy);
        r = Math.max(r, d + options.nodeRadius(n));
      }
      return { cx, cy, r, dx: 0, dy: 0, size: ns.length };
    });

    // Push overlapping discs apart; the smaller cluster moves more.
    for (let i = 0; i < discs.length; i++) {
      const a = discs[i];
      for (let j = i + 1; j < discs.length; j++) {
        const b = discs[j];
        let dx = b.cx - a.cx;
        let dy = b.cy - a.cy;
        let d = Math.hypot(dx, dy);
        const need = a.r + b.r + gap;
        if (d >= need) continue;
        if (d < 1e-6) {
          // Same centre: split along a fixed, index-based direction.
          const angle = (i * 7 + j) * 2.399963;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push = ((need - d) / d) * SEPARATE_STRENGTH;
        const wa = b.size / (a.size + b.size);
        const wb = a.size / (a.size + b.size);
        a.dx -= dx * push * wa;
        a.dy -= dy * push * wa;
        b.dx += dx * push * wb;
        b.dy += dy * push * wb;
      }
    }

    // Move whole clusters: separation plus a pull of the centroid to the
    // origin. Shifting every member alike keeps each cluster's shape.
    members.forEach((ns, i) => {
      const disc = discs[i];
      const mx = disc.dx - disc.cx * gravity * alpha;
      const my = disc.dy - disc.cy * gravity * alpha;
      for (const n of ns) {
        n.vx = (n.vx ?? 0) + mx;
        n.vy = (n.vy ?? 0) + my;
      }
    });
  };

  return Object.assign(force, {
    initialize: (nodes: LayoutNode[]): void => {
      byId = new Map(nodes.map((n) => [n.id, n]));
      resolve();
    },
    groups: (g: number[][]): void => {
      groups = g;
      resolve();
    },
  });
}
