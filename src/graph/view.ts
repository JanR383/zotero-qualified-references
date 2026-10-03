import type { Stance } from "../modules/types";

/**
 * Pure view logic for the graph window: filters (G2), label detail (G1),
 * node size (G4) and search focus (G5). Kept free of DOM and force-graph so it
 * is unit-tested without opening the window.
 */

export interface ViewNode {
  id: number;
  label: string;
  itemType: string;
}

export interface ViewLink {
  source: number;
  target: number;
  stance: Stance;
}

export interface ViewFilters {
  stances: ReadonlySet<Stance>;
  types: ReadonlySet<string>;
  /** A node needs at least this many references left after filtering (≥ 1). */
  minLinks: number;
  /** Tag focus (G12): ids of highlighted nodes, or null when off. */
  focusOn: ReadonlySet<number> | null;
  query: string;
  /** Neighbourhood around search hits: 1 or 2 steps. */
  depth: 1 | 2;
}

export interface ViewState {
  /** Nodes left after filters and tag focus. */
  visible: Set<number>;
  /** References per visible node (both directions, visible links only). */
  degree: Map<number, number>;
  /** Incoming references per visible node (visible links only). */
  incoming: Map<number, number>;
  /** Nodes whose label is always drawn: the most connected ones (G1). */
  hubs: Set<number>;
  /** Search hits, or null without a query. */
  hits: Set<number> | null;
  /** Hits plus their neighbourhood; everything else is dimmed (G5). */
  focus: Set<number> | null;
}

/** A link is shown when its stance passes and both ends are visible. */
export function linkShown(
  l: ViewLink,
  state: ViewState,
  stances: ReadonlySet<Stance>,
): boolean {
  return (
    stances.has(l.stance) &&
    state.visible.has(l.source) &&
    state.visible.has(l.target)
  );
}

/** Split a query into lower-cased terms; a label must contain all of them. */
export function matchesQuery(label: string, query: string): boolean {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = label.toLocaleLowerCase();
  return terms.length > 0 && terms.every((t) => text.includes(t));
}

export function computeView(
  nodes: ViewNode[],
  links: ViewLink[],
  f: ViewFilters,
): ViewState {
  const count = (ls: ViewLink[], keep: Set<number> | null) => {
    const degree = new Map<number, number>();
    const incoming = new Map<number, number>();
    for (const l of ls) {
      if (keep && (!keep.has(l.source) || !keep.has(l.target))) continue;
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
      incoming.set(l.target, (incoming.get(l.target) ?? 0) + 1);
    }
    return { degree, incoming };
  };

  // 1. Stance and type filters; a node needs minLinks references among the
  //    links that pass (counted between nodes of an allowed type).
  const typed = new Set(
    nodes.filter((n) => f.types.has(n.itemType)).map((n) => n.id),
  );
  const stanceLinks = links.filter((l) => f.stances.has(l.stance));
  const min = Math.max(1, f.minLinks);
  const first = count(stanceLinks, typed).degree;
  let visible = new Set([...typed].filter((id) => (first.get(id) ?? 0) >= min));

  // 2. Tag focus: highlighted nodes plus their direct neighbours.
  if (f.focusOn && f.focusOn.size > 0) {
    const keep = new Set<number>();
    for (const l of stanceLinks) {
      if (!visible.has(l.source) || !visible.has(l.target)) continue;
      if (f.focusOn.has(l.source) || f.focusOn.has(l.target)) {
        keep.add(l.source);
        keep.add(l.target);
      }
    }
    visible = keep;
  }

  const { degree, incoming } = count(stanceLinks, visible);
  // A node whose links all ended at filtered-out nodes has nothing left.
  for (const id of [...visible]) if (!degree.has(id)) visible.delete(id);

  // 3. Hubs: the top tenth by degree, at least 3 references each.
  const ranked = [...visible]
    .map((id) => degree.get(id) ?? 0)
    .sort((a, b) => b - a);
  const cut = Math.max(3, ranked[Math.floor(ranked.length / 10)] ?? 3);
  const hubs = new Set(
    [...visible].filter((id) => (degree.get(id) ?? 0) >= cut),
  );

  // 4. Search: hits among visible nodes, widened by 1–2 steps.
  let hits: Set<number> | null = null;
  let focus: Set<number> | null = null;
  if (f.query.trim()) {
    hits = new Set(
      nodes
        .filter((n) => visible.has(n.id) && matchesQuery(n.label, f.query))
        .map((n) => n.id),
    );
    let reached = new Set<number>(hits);
    for (let step = 0; step < f.depth; step++) {
      const next = new Set<number>(reached);
      for (const l of stanceLinks) {
        if (!visible.has(l.source) || !visible.has(l.target)) continue;
        if (reached.has(l.source)) next.add(l.target);
        if (reached.has(l.target)) next.add(l.source);
      }
      reached = next;
    }
    focus = reached;
  }

  return { visible, degree, incoming, hubs, hits, focus };
}

/** Node radius factor by incoming references (G4): 1 … 2.2. */
export function sizeFactor(incoming: number): number {
  return Math.min(2.2, 1 + 0.3 * Math.sqrt(incoming));
}

/**
 * Arrowhead length in graph units. Grows with the zoom like the rest of the
 * graph, but stays between 6 and 16 screen pixels so arrows remain visible
 * when zoomed out and don't swamp the view when zoomed in. It never takes
 * more than 40 % of the edge's visible part (between the node borders), so
 * short edges keep a line behind the arrow and still read as directed.
 */
export function arrowLength(scale: number, visibleLength: number): number {
  if (!(scale > 0) || visibleLength <= 0) return 0;
  const px = Math.min(16, Math.max(6, 7 * scale));
  return Math.min(px / scale, 0.4 * visibleLength);
}
