/**
 * Standalone renderer for the reference-graph window (M5).
 *
 * Bundled separately (see zotero-plugin.config.ts) and loaded as a classic
 * <script> by addon/content/graph.xhtml. Reads its data from
 * `window.arguments[0]` (handed over by src/modules/graphView.ts).
 *
 * Rendering uses force-graph by Vasco Asturiano (MIT):
 *   https://github.com/vasturiano/force-graph
 *
 * Stance colours are NOT hard-coded here: qref.css is linked in graph.xhtml,
 * so we read the computed values of its --qref-stance-* custom properties.
 * That keeps qref.css the single source of truth (incl. dark-mode) — CSS
 * var() does not apply to canvas drawing, so we resolve to concrete hex.
 */
import ForceGraph from "force-graph";
import {
  SHAPE_GLYPH,
  typeColor,
  typeShape,
  type NodeShape,
} from "../modules/itemTypeColors";
import {
  STANCE_CSS_VAR,
  STANCE_GLYPH,
  STANCE_ORDER,
} from "../modules/stanceMeta";
import { byId, create } from "../shared/dom";
import { buildScopeSelect } from "../shared/scopeSelect";
import { onViewDataChanged } from "../shared/viewArg";
import {
  referencesCsv,
  referencesGraphml,
  type ExportItem,
  type ExportRef,
} from "../shared/export";
import { assignTagColors, ringColors } from "../modules/tagHighlight";
import { escapeHtml, truncate } from "../shared/text";
import { buildTagSelect } from "./tagSelect";
import { computeView, linkShown, sizeFactor, type ViewState } from "./view";
import { timeScale, type TimeScale } from "./timeline";
import { LabelBoxes, estimateLabelWidth } from "./labels";
import { clusterForce, components } from "./layout";
import { egoLayout, layerLevels, type DirectedLink } from "./modes";
import type { Stance } from "../modules/types";
import type {
  GraphArg,
  GraphData,
  GraphLink,
  GraphNode,
  GraphStrings,
} from "./types";

// This module runs in a real browser-like window (graph.xhtml). The plugin's
// tsconfig (zotero-types sandbox) provides DOM *types* but not the browser
// global *values*, so declare the few we use here.
declare const window: Window &
  typeof globalThis & {
    arguments?: unknown[];
    matchMedia(query: string): { matches: boolean } | null;
  };
declare const document: Document;
declare function getComputedStyle(
  elt: Element,
  pseudoElt?: string | null,
): CSSStyleDeclaration;

function cssVar(name: string): string {
  const root = document.documentElement;
  if (!root) return "";
  return getComputedStyle(root).getPropertyValue(name).trim();
}

function stanceColor(stance: Stance): string {
  return cssVar(STANCE_CSS_VAR[stance]) || "#888888";
}

/** Trace the path of a node shape centred at (x,y) with "radius" r. */
function pathShape(
  ctx: CanvasRenderingContext2D,
  shape: NodeShape,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  if (shape === "square") {
    ctx.rect(x - r, y - r, 2 * r, 2 * r);
  } else if (shape === "triangle") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x - r, y + r);
    ctx.closePath();
  } else if (shape === "diamond") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, 2 * Math.PI);
  }
}

function legendRow(swatchColor: string, label: string): HTMLElement {
  const row = create("div");
  row.className = "legend-row";
  const swatch = create("span");
  swatch.className = "legend-swatch";
  swatch.style.background = swatchColor;
  const text = create("span");
  text.textContent = label;
  row.append(swatch, text);
  return row;
}

function renderLegend(
  arg: GraphArg,
  typeLegend: GraphArg["typeLegend"],
  tagLegend: { name: string; color: string }[],
  isDark: boolean,
): void {
  const legend = byId("legend");
  if (!legend) return;
  legend.replaceChildren(); // re-rendered on scope change
  // Edge colours = stance.
  for (const stance of STANCE_ORDER) {
    legend.appendChild(
      legendRow(
        stanceColor(stance),
        `${STANCE_GLYPH[stance]}  ${arg.strings.stances[stance]}`,
      ),
    );
  }
  // Node shapes (+ colours when enabled) = item type (N5).
  if (typeLegend.length > 0) {
    const sep = create("div");
    sep.style.height = "6px";
    legend.appendChild(sep);
    const neutral =
      (document.body && getComputedStyle(document.body).color) || "#888";
    for (const { type, label } of typeLegend) {
      const row = create("div");
      row.className = "legend-row";
      const glyph = create("span");
      glyph.className = "legend-type-glyph";
      glyph.style.textAlign = "center";
      glyph.style.color = arg.colorByType ? typeColor(type, isDark) : neutral;
      glyph.textContent = SHAPE_GLYPH[typeShape(type)];
      const text = create("span");
      text.textContent = label;
      row.append(glyph, text);
      legend.appendChild(row);
    }
  }
  // Ring colours = highlighted tags (G12).
  if (tagLegend.length > 0) {
    const sep = create("div");
    sep.style.height = "6px";
    legend.appendChild(sep);
    for (const { name, color } of tagLegend) {
      const row = legendRow("transparent", name);
      const swatch = row.firstElementChild as HTMLElement;
      swatch.style.border = `2.5px solid ${color}`;
      swatch.style.borderRadius = "50%";
      swatch.style.boxSizing = "border-box";
      legend.appendChild(row);
    }
  }
}

/** A link end is an id until force-graph swaps in the node object. */
function endId(end: unknown): number {
  return typeof end === "object" && end !== null
    ? (end as GraphNode).id
    : (end as number);
}

/**
 * `#rgb`/`#rrggbb` as rgba() with the given opacity. The stance colours are
 * hex values (qref.css and the palettes); anything else is returned as is.
 */
function hexWithAlpha(color: string, alpha: number): string {
  let hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.replace(/./g, "$&$&");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const n = parseInt(hex, 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** One checkbox with a label, for the filter rows. */
function checkbox(
  label: HTMLElement | string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  title?: string,
): HTMLElement {
  const wrap = create("label");
  wrap.className = "check";
  if (title) wrap.title = title;
  const box = create("input") as HTMLInputElement;
  box.type = "checkbox";
  box.checked = checked;
  box.addEventListener("change", () => onChange(box.checked));
  wrap.append(box, label);
  return wrap;
}

/** Hover text for an edge (G3). Every value from item data is escaped. */
function linkTooltip(
  l: GraphLink,
  labels: Map<number, string>,
  strings: GraphStrings,
): string {
  const name = (id: number) => escapeHtml(truncate(labels.get(id) ?? "", 60));
  const rows = [
    `<div><b>${STANCE_GLYPH[l.stance]}</b> ${escapeHtml(strings.stances[l.stance])}</div>`,
    `<div>${name(endId(l.source))} → ${name(endId(l.target))}</div>`,
  ];
  const pages: string[] = [];
  if (l.sourcePages) {
    pages.push(
      `${escapeHtml(strings.sourcePages)} ${escapeHtml(l.sourcePages)}`,
    );
  }
  if (l.targetPages) {
    pages.push(
      `${escapeHtml(strings.targetPages)} ${escapeHtml(l.targetPages)}`,
    );
  }
  if (pages.length > 0) rows.push(`<div>${pages.join(" · ")}</div>`);
  if (l.comment) {
    rows.push(
      `<div style="white-space:pre-wrap;margin-top:4px">${escapeHtml(truncate(l.comment, 300))}</div>`,
    );
  }
  rows.push(
    `<div style="opacity:.65;font-size:.85em;margin-top:4px">${escapeHtml(
      l.hasAnchor ? strings.linkOpenPdf : strings.linkSelect,
    )}</div>`,
  );
  return `<div style="max-width:380px">${rows.join("")}</div>`;
}

function main(): void {
  const arg = window.arguments?.[0] as GraphArg | undefined;
  if (!arg) return;
  const strings = arg.strings;

  document.title = strings.title;

  // Apply the stance-palette override (M7) before reading any --qref-stance-*
  // values, so legend swatches and edge colours pick up the chosen palette.
  if (arg.paletteCss) {
    const style = create("style");
    style.textContent = arg.paletteCss;
    (document.head ?? document.documentElement)?.appendChild(style);
  }

  const isDark = !!window.matchMedia("(prefers-color-scheme: dark)")?.matches;

  const container = byId("graph");
  if (!container) return;

  const empty = byId("empty");
  const showEmpty = (show: boolean): void => {
    if (!empty) return;
    empty.textContent = strings.empty;
    empty.style.display = show ? "block" : "none";
  };

  // Curve parallel / bidirectional edges apart so each keeps a visible arrow
  // (a single edge between a pair stays straight). source/target are still ids
  // here (before force-graph replaces them with node objects).
  const computeCurvature = (links: GraphLink[]): void => {
    const groups = new Map<string, GraphLink[]>();
    for (const l of links) {
      const a = l.source as number;
      const b = l.target as number;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const arr = groups.get(key);
      if (arr) arr.push(l);
      else groups.set(key, [l]);
    }
    for (const arr of groups.values()) {
      if (arr.length === 1) arr[0].curvature = 0;
      else arr.forEach((l, i) => (l.curvature = 0.12 * (i + 1)));
    }
  };

  const haloColor = isDark ? "rgba(28,28,30,0.85)" : "rgba(255,255,255,0.85)";

  const colorCache = new Map<Stance, string>();
  const colorFor = (s: Stance): string => {
    let c = colorCache.get(s);
    if (c === undefined) {
      c = stanceColor(s);
      colorCache.set(s, c);
    }
    return c;
  };

  const nodeColor = cssVar("--qref-node-color") || "#5b8def";
  const body = document.body;
  const labelColor = (body && getComputedStyle(body).color) || "#222222";

  const R = 8; // base node "radius" in graph units (symbol size + hit area)
  // Tag ring (G12): drawn outside the shape's corners (at most r·√2).
  const RING_GAP = 4;
  const RING_W = 2.5;
  // Labels of all nodes are drawn from this zoom on, or for small graphs (G1).
  const LABEL_ZOOM = 1.5;
  const LABEL_ALL_MAX_NODES = 40;
  const DIMMED = 0.15; // opacity of nodes/links outside the search focus (G5)
  const EGO_OUTER = 0.45; // opacity of the ego network's second ring

  // Filter and highlight state. Types start with every type present.
  const shownStances = new Set<Stance>(STANCE_ORDER);
  const shownTypes = new Set<string>();
  let knownTypes = new Set<string>();
  let minLinks = 1;
  let sizeByIncoming = true;
  let query = "";
  let depth: 1 | 2 = 1;
  // With tag highlighting switched off, a stored selection must not leave
  // rings that can't be changed from the window.
  const selectedTags = new Set(arg.controls.tags ? arg.highlightTags : []);
  let rings = new Map<number, string[]>();
  let tagFocus = false;
  // Layout mode: force network, timeline (G11), ego network or layers.
  type LayoutMode = "network" | "timeline" | "ego" | "layers";
  let mode: LayoutMode = "network";
  let egoCenter: number | null = null;
  let egoOuter = new Set<number>(); // second ring, drawn faded
  let egoSide = new Map<number, number>(); // -1 / 1: label left / right
  let egoAbove = new Set<number>(); // label above (top of the ring)
  let layers = new Map<number, number>(); // layer per item
  let layerGap = 0; // vertical distance between layers, graph units
  let hovered: number | null = null;
  let labels = new Map<number, string>();
  let view: ViewState = {
    visible: new Set(),
    degree: new Map(),
    incoming: new Map(),
    hubs: new Set(),
    hits: null,
    focus: null,
  };

  const radius = (n: GraphNode): number =>
    sizeByIncoming ? R * sizeFactor(view.incoming.get(n.id) ?? 0) : R;
  const ringRadius = (n: GraphNode): number => radius(n) * 1.42 + RING_GAP / 2;
  const outer = (n: GraphNode): number =>
    rings.has(n.id) ? ringRadius(n) + RING_W / 2 : radius(n);
  const dimmed = (id: number): boolean => !!view.focus && !view.focus.has(id);
  const alphaOf = (id: number): number =>
    dimmed(id) ? DIMMED : egoOuter.has(id) ? EGO_OUTER : 1;
  const linkAlpha = (l: GraphLink): number =>
    Math.min(alphaOf(endId(l.source)), alphaOf(endId(l.target)));
  const withAlpha = (color: string, alpha: number): string =>
    alpha >= 1 ? color : hexWithAlpha(color, alpha);

  const graph = new ForceGraph<GraphNode, GraphLink>(container)
    .graphData({ nodes: [], links: [] })
    .nodeId("id")
    .nodeLabel((n) => n.tooltip)
    // nodeRelSize is the circle radius per unit nodeVal; force-graph insets the
    // arrow tip by √val · R, so nodeVal = (outer/R)² stops arrows at the drawn
    // border (or ring) of each node, whatever its size.
    .nodeRelSize(R)
    .nodeVal((n) => (outer(n) / R) ** 2)
    .nodeVisibility((n) => view.visible.has(n.id))
    .linkVisibility((l) =>
      linkShown(
        { source: endId(l.source), target: endId(l.target), stance: l.stance },
        view,
        shownStances,
      ),
    )
    .linkColor((l) => withAlpha(colorFor(l.stance), linkAlpha(l)))
    .linkWidth(1.5)
    .linkCurvature("curvature")
    .linkDirectionalArrowLength(7)
    .linkDirectionalArrowColor((l) =>
      withAlpha(colorFor(l.stance), linkAlpha(l)),
    )
    .linkDirectionalArrowRelPos(1)
    .linkLabel((l) => linkTooltip(l, labels, strings))
    .linkHoverPrecision(6)
    .onLinkClick((l) => {
      const source = endId(l.source);
      if (l.hasAnchor) arg.openAnchor(source, l.id);
      else arg.selectItem(source);
    })
    .onNodeClick((n) => {
      arg.selectItem(n.id);
      // Ego network: the clicked item becomes the centre.
      if (mode === "ego" && n.id !== egoCenter) {
        egoCenter = n.id;
        refresh();
        fitSoon();
      }
    })
    .onNodeHover((n) => {
      hovered = n ? n.id : null;
    })
    // Custom node rendering: shape by item type (N5b), filled with the type
    // colour (or a uniform colour when colour-by-type is off), plus the label.
    .nodeCanvasObjectMode(() => "replace")
    .nodeCanvasObject((n, ctx, scale) => {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const r = radius(n);
      ctx.globalAlpha = alphaOf(n.id);
      pathShape(ctx, typeShape(n.itemType), x, y, r);
      ctx.fillStyle = arg.colorByType
        ? typeColor(n.itemType, isDark)
        : nodeColor;
      ctx.fill();
      if (view.hits?.has(n.id)) {
        // Search hit: outline the shape in the label colour.
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = labelColor;
        ctx.stroke();
      }
      const ring = rings.get(n.id);
      if (ring) {
        // One arc segment per highlighted tag, starting at the top.
        const step = (2 * Math.PI) / ring.length;
        ctx.lineWidth = RING_W;
        ring.forEach((color, i) => {
          ctx.beginPath();
          ctx.arc(
            x,
            y,
            ringRadius(n),
            -Math.PI / 2 + i * step,
            -Math.PI / 2 + (i + 1) * step,
          );
          ctx.strokeStyle = color;
          ctx.stroke();
        });
      }
      // Label detail (G1): small graphs, zoomed in, hubs, hovered node,
      // search focus and tag-highlighted nodes.
      const showLabel =
        view.visible.size <= LABEL_ALL_MAX_NODES ||
        scale >= LABEL_ZOOM ||
        hovered === n.id ||
        view.hubs.has(n.id) ||
        rings.has(n.id) ||
        (view.focus?.has(n.id) ?? false);
      if (showLabel) {
        const fontSize = 12 / scale;
        ctx.font = `${fontSize}px sans-serif`;
        // Below the node; in the ego network outside the ring (left, right,
        // or above at the top).
        const side = egoSide.get(n.id) ?? 0;
        const above = egoAbove.has(n.id);
        ctx.textAlign = side < 0 ? "right" : side > 0 ? "left" : "center";
        ctx.textBaseline = side ? "middle" : "top";
        const text = n.label.length > 40 ? `${n.label.slice(0, 39)}…` : n.label;
        const lx = x + side * (outer(n) + 4 / scale);
        const ly = side
          ? y
          : above
            ? y - outer(n) - 2 / scale - fontSize * 1.2
            : y + outer(n) + 2 / scale;
        // Skip a label that would cover one already drawn (nodes are drawn
        // most-connected first); hovered node and search hits always show.
        const w = ctx.measureText(text).width;
        const box = {
          x: side < 0 ? lx - w : side > 0 ? lx : lx - w / 2,
          y: side ? ly - fontSize * 0.6 : ly,
          w,
          h: fontSize * 1.2,
        };
        if (hovered === n.id || view.hits?.has(n.id)) labelBoxes.force(box);
        else if (!labelBoxes.claim(box)) {
          ctx.globalAlpha = 1;
          return;
        }
        // Contrasting halo behind the label so it stays legible over edges.
        ctx.lineWidth = 3 / scale;
        ctx.lineJoin = "round";
        ctx.strokeStyle = haloColor;
        ctx.strokeText(text, lx, ly);
        ctx.fillStyle = labelColor;
        ctx.fillText(text, lx, ly);
      }
      ctx.globalAlpha = 1;
    })
    // Timeline layout (G11): year grid behind the nodes; layered layout:
    // one numbered line per layer.
    .onRenderFramePre((ctx, scale) => {
      labelBoxes.reset();
      if (!timeline && mode !== "layers") return;
      const tl = graph.screen2GraphCoords(0, 0);
      const br = graph.screen2GraphCoords(
        window.innerWidth,
        window.innerHeight,
      );
      const fontSize = 11 / scale;
      ctx.save();
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.strokeStyle = labelColor;
      ctx.fillStyle = labelColor;
      ctx.lineWidth = 1 / scale;
      const column = (x: number, text: string, dashed: boolean): void => {
        ctx.globalAlpha = 0.15;
        ctx.setLineDash(dashed ? [4 / scale, 4 / scale] : []);
        ctx.beginPath();
        ctx.moveTo(x, tl.y);
        ctx.lineTo(x, br.y);
        ctx.stroke();
        ctx.globalAlpha = 0.7;
        // Year at the bottom edge: legend and controls cover the top.
        ctx.fillText(text, x, br.y - fontSize - 6 / scale);
      };
      if (timeline) {
        for (const t of timeline.ticks) column(t.x, String(t.year), false);
        if (timeline.undatedX !== null) {
          column(timeline.undatedX, strings.undated, true);
        }
      } else {
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        const top = Math.max(-1, ...layers.values());
        for (let l = 0; l <= top; l++) {
          const y = -l * layerGap;
          ctx.globalAlpha = 0.15;
          ctx.beginPath();
          ctx.moveTo(tl.x, y);
          ctx.lineTo(br.x, y);
          ctx.stroke();
          ctx.globalAlpha = 0.7;
          ctx.fillText(`${strings.layerLevel} ${l}`, tl.x + 6 / scale, y);
        }
      }
      ctx.restore();
    })
    // Paint the clickable hit area to match the drawn shape.
    .nodePointerAreaPaint((n, color, ctx) => {
      pathShape(ctx, typeShape(n.itemType), n.x ?? 0, n.y ?? 0, radius(n));
      ctx.fillStyle = color;
      ctx.fill();
    });

  // Edge-length control: set the initial force-link distance and wire the
  // in-window slider so dense graphs can be spread out for legibility.
  const linkForce = graph.d3Force("link") as
    { distance: (d: number) => unknown } | undefined;
  // Network layout: repulsion grows with the edge length, and unconnected
  // clusters are kept apart (their nodes too) by clusterForce. Hidden nodes
  // neither repel nor take part in a cluster.
  const chargeForce = graph.d3Force("charge") as
    | {
        strength: (s: number | ((n: GraphNode) => number)) => unknown;
        distanceMax: (d: number) => unknown;
      }
    | undefined;
  let distance = arg.linkDistance;
  const clusters = clusterForce({
    gap: () => Math.max(20, distance * 0.3),
    nodeRadius: (n) => outer(n as GraphNode),
    spacing: () => distance * 0.5,
  });
  let clusterKey = "";
  const applyNetworkForces = (): void => {
    const scaled = mode !== "timeline";
    chargeForce?.strength(
      scaled
        ? (n: GraphNode) =>
            view.visible.has(n.id) ? -Math.max(30, distance * 1.5) : 0
        : -30,
    );
    chargeForce?.distanceMax(scaled ? distance * 4 : Infinity);
    graph.d3Force("clusters", mode === "network" ? clusters : null);
    graph.d3Force("layersX", mode === "layers" ? spreadLayers : null);
  };
  // Clusters as shown: visible nodes joined by visible links. Returns true
  // when they differ from the last call.
  const updateClusters = (shown: DirectedLink[]): boolean => {
    const groups = components(view.visible, shown);
    clusters.groups(groups);
    const key = groups
      .map((g) => [...g].sort((a, b) => a - b).join(","))
      .join("|");
    const changed = key !== clusterKey;
    clusterKey = key;
    return changed;
  };
  const applyDistance = (d: number): void => {
    distance = d;
    linkForce?.distance(d);
    applyNetworkForces();
    // Ego and layer positions are spaced by the edge length too.
    if (mode === "ego" || mode === "layers") refresh();
    graph.d3ReheatSimulation();
  };

  // Timeline layout (G11): x is fixed by year, y stays free but is pulled
  // gently towards the axis so the band does not drift apart.
  let timeline: TimeScale | null = null;
  let layoutNodes: GraphNode[] = [];
  // Items whose labels would overlap horizontally (near years) are pushed
  // apart vertically, so the timeline does not stack labels on one line.
  const LABEL_GAP = 34; // vertical room per label row, graph units
  const pullToAxis = Object.assign(
    (alpha: number): void => {
      for (const n of layoutNodes)
        n.vy = (n.vy ?? 0) - (n.y ?? 0) * 0.05 * alpha;
      const shown = layoutNodes
        .filter((n) => view.visible.has(n.id))
        .sort((a, b) => (a.fx ?? 0) - (b.fx ?? 0));
      for (let i = 0; i < shown.length; i++) {
        const a = shown[i];
        const wa = estimateLabelWidth(a.label);
        for (let j = i + 1; j < shown.length; j++) {
          const b = shown[j];
          const dx = (b.fx ?? 0) - (a.fx ?? 0);
          if (dx >= (wa + estimateLabelWidth(b.label)) / 2) break;
          const dy = (b.y ?? 0) - (a.y ?? 0);
          if (Math.abs(dy) >= LABEL_GAP) continue;
          const push = (LABEL_GAP - Math.abs(dy)) * 0.5 * alpha;
          const dir = dy === 0 ? (j % 2 ? 1 : -1) : Math.sign(dy);
          a.vy = (a.vy ?? 0) - push * dir;
          b.vy = (b.vy ?? 0) + push * dir;
        }
      }
    },
    {
      initialize: (ns: GraphNode[]): void => {
        layoutNodes = ns;
      },
    },
  );
  // Layered layout: y is fixed by layer; items of one layer are pushed
  // apart horizontally so their labels do not overlap.
  let layerNodes: GraphNode[] = [];
  const spreadLayers = Object.assign(
    (alpha: number): void => {
      const rows = new Map<number, GraphNode[]>();
      for (const n of layerNodes) {
        const l = layers.get(n.id);
        if (l === undefined || !view.visible.has(n.id)) continue;
        const row = rows.get(l);
        if (row) row.push(n);
        else rows.set(l, [n]);
      }
      for (const row of rows.values()) {
        row.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        for (let i = 0; i + 1 < row.length; i++) {
          const a = row[i];
          const b = row[i + 1];
          const need =
            (estimateLabelWidth(a.label) + estimateLabelWidth(b.label)) / 2 +
            10;
          const dx = (b.x ?? 0) - (a.x ?? 0);
          if (dx >= need) continue;
          const push = (need - dx) * 0.3; // like a collision, not cooled by alpha
          a.vx = (a.vx ?? 0) - push;
          b.vx = (b.vx ?? 0) + push;
        }
      }
    },
    {
      initialize: (ns: GraphNode[]): void => {
        layerNodes = ns;
      },
    },
  );
  // Fit the view once the new positions are roughly in place, and again
  // when the layout has settled. Ego and layer labels need more margin.
  let refitOnStop = false;
  const fit = (): void => {
    const pad = mode === "ego" || mode === "layers" ? 100 : 40;
    graph.zoomToFit(600, pad, (n) => view.visible.has(n.id));
  };
  const fitSoon = (): void => {
    refitOnStop = true;
    window.setTimeout(fit, 900);
  };
  graph.onEngineStop(() => {
    if (!refitOnStop) return;
    refitOnStop = false;
    fit();
  });
  const applyLayout = (next: LayoutMode, refit = true): void => {
    mode = next;
    if (mode === "ego") egoCenter = null; // pick afresh (Zotero selection)
    timeline =
      mode === "timeline" ? timeScale(current.nodes.map((n) => n.year)) : null;
    for (const n of current.nodes) {
      delete n.fx;
      delete n.fy;
      if (timeline) n.fx = timeline.x(n.year);
    }
    graph.d3Force("timelineY", timeline ? pullToAxis : null);
    refresh(); // places ego and layer items, sets the forces
    graph.d3ReheatSimulation();
    if (refit) fitSoon();
  };

  // Ego network: the centre is kept while visible; otherwise the item
  // selected in Zotero, the first search hit or the most connected item.
  const pickCenter = (): number | null => {
    if (egoCenter !== null && view.visible.has(egoCenter)) return egoCenter;
    const selected = arg.getSelectedItemId?.() ?? null;
    if (selected !== null && view.visible.has(selected)) return selected;
    const pool = view.hits
      ? current.nodes.filter((n) => view.hits!.has(n.id))
      : current.nodes; // sorted most connected first
    return pool.find((n) => view.visible.has(n.id))?.id ?? null;
  };
  // Fix the ego / layer positions; returns a key that changes whenever they do.
  const placeNodes = (shown: DirectedLink[]): string => {
    egoOuter = new Set();
    egoSide = new Map();
    egoAbove = new Set();
    layers = new Map();
    if (mode === "ego") {
      egoCenter = pickCenter();
      const byId = new Map(current.nodes.map((n) => [n.id, n]));
      const order = (a: number, b: number): number => {
        const na = byId.get(a);
        const nb = byId.get(b);
        return (
          (na?.year ?? 9999) - (nb?.year ?? 9999) ||
          (na?.label ?? "").localeCompare(nb?.label ?? "")
        );
      };
      const places =
        egoCenter === null
          ? new Map()
          : egoLayout(
              egoCenter,
              shown,
              { ring: Math.max(300, 240 + distance), gap: 40 },
              order,
            );
      for (const id of [...view.visible]) {
        if (!places.has(id)) view.visible.delete(id);
      }
      for (const n of current.nodes) {
        const p = places.get(n.id);
        if (p) {
          n.fx = p.x;
          n.fy = p.y;
          if (p.level === 2) egoOuter.add(n.id);
          if (Math.abs(p.x) > 1) egoSide.set(n.id, Math.sign(p.x));
          else if (p.y < 0) egoAbove.add(n.id);
        } else {
          delete n.fx;
          delete n.fy;
        }
      }
      return `ego:${[...places].map(([id, p]) => `${id}@${p.x},${p.y}`).join(";")}`;
    }
    if (mode === "layers") {
      layers = layerLevels(view.visible, shown);
      layerGap = Math.max(120, distance * 2);
      for (const n of current.nodes) {
        const l = layers.get(n.id);
        if (l !== undefined) n.fy = -l * layerGap;
        else delete n.fy;
      }
      return `layers:${layerGap}:${[...layers].join(";")}`;
    }
    return "";
  };
  let placedKey = "";

  const labelBoxes = new LabelBoxes();

  let current: GraphData = {
    nodes: [],
    links: [],
    typeLegend: [],
    itemTypes: [],
    tagOptions: [],
  };
  applyDistance(arg.linkDistance);

  // Recompute rings, filters, search focus and legend; setting the accessors
  // again makes force-graph redraw even when the layout is at rest.
  // Filters sit in a collapsible group; its summary counts the active ones so
  // a collapsed group still shows that something is hidden.
  const filterSummary = byId("filters-summary");
  const updateFilterSummary = (): void => {
    if (!filterSummary) return;
    const active =
      Number(shownStances.size < STANCE_ORDER.length) +
      Number([...knownTypes].some((t) => !shownTypes.has(t))) +
      Number(minLinks > 1);
    filterSummary.textContent =
      active > 0 ? `${strings.filters} (${active})` : strings.filters;
  };

  const refresh = (): void => {
    const assigned = assignTagColors([...selectedTags], current.tagOptions);
    rings = new Map();
    for (const n of current.nodes) {
      const colors = ringColors(n.tags, assigned);
      if (colors.length > 0) rings.set(n.id, colors);
    }
    view = computeView(
      current.nodes,
      current.links.map((l) => ({
        source: endId(l.source),
        target: endId(l.target),
        stance: l.stance,
      })),
      {
        stances: shownStances,
        types: shownTypes,
        minLinks,
        focusOn: tagFocus && rings.size > 0 ? new Set(rings.keys()) : null,
        query,
        depth,
      },
    );
    // Charge strengths depend on visibility; re-layout when the clusters
    // shown or the ego / layer positions have changed (filters can split or
    // join clusters).
    const shown = current.links
      .map((l) => ({
        source: endId(l.source),
        target: endId(l.target),
        stance: l.stance,
      }))
      .filter((l) => linkShown(l, view, shownStances));
    const key = placeNodes(shown);
    applyNetworkForces();
    const clustersChanged = updateClusters(shown);
    if (mode === "network" ? clustersChanged : key !== placedKey) {
      graph.d3ReheatSimulation();
    }
    placedKey = key;
    updateFilterSummary();
    renderLegend(arg, current.typeLegend, [...assigned.values()], isDark);
    showEmpty(view.visible.size === 0);
    graph
      .nodeVal(graph.nodeVal())
      .nodeVisibility(graph.nodeVisibility())
      .linkVisibility(graph.linkVisibility())
      .linkColor(graph.linkColor());
  };

  const tagSelect = buildTagSelect(strings, selectedTags, () => {
    arg.onHighlightTagsChange?.([...selectedTags]);
    refresh();
  });

  // Type filter checkboxes (G2), rebuilt per scope. Types new to this scope
  // start checked; types unchecked before stay unchecked.
  const typeMount = byId("type-filter");
  const renderTypeFilter = (): void => {
    if (!typeMount) return;
    typeMount.replaceChildren();
    for (const { type, label } of current.itemTypes) {
      const glyph = create("span");
      glyph.className = "type-glyph";
      glyph.textContent = SHAPE_GLYPH[typeShape(type)];
      const text = create("span");
      text.textContent = label;
      const content = create("span");
      content.append(glyph, text);
      typeMount.appendChild(
        checkbox(content, shownTypes.has(type), (on) => {
          if (on) shownTypes.add(type);
          else shownTypes.delete(type);
          refresh();
        }),
      );
    }
  };

  // (Re)load the graph data, edge curvature and legends for a scope. A live
  // refresh (G6/L8) keeps the positions of nodes that are still there and
  // the current view, so the graph does not jump on every edit.
  const applyData = (data: GraphData, live = false): void => {
    if (live) {
      const old = new Map(current.nodes.map((n) => [n.id, n]));
      for (const n of data.nodes) {
        const o = old.get(n.id);
        if (!o) continue;
        n.x = o.x;
        n.y = o.y;
        n.vx = o.vx;
        n.vy = o.vy;
      }
    }
    current = data;
    labels = new Map(data.nodes.map((n) => [n.id, n.label]));
    for (const { type } of data.itemTypes) {
      if (!knownTypes.has(type)) shownTypes.add(type);
    }
    knownTypes = new Set([...knownTypes, ...data.itemTypes.map((t) => t.type)]);
    computeCurvature(data.links);
    // Draw (and so label) the most connected nodes first.
    const degree = new Map<number, number>();
    for (const l of data.links) {
      for (const id of [endId(l.source), endId(l.target)]) {
        degree.set(id, (degree.get(id) ?? 0) + 1);
      }
    }
    data.nodes.sort(
      (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0),
    );
    graph.graphData({ nodes: data.nodes, links: data.links });
    tagSelect.setOptions(data.tagOptions);
    renderTypeFilter();
    refresh();
    if (timeline) applyLayout("timeline", !live);
  };
  applyData({
    nodes: arg.nodes,
    links: arg.links,
    typeLegend: arg.typeLegend,
    itemTypes: arg.itemTypes,
    tagOptions: arg.tagOptions,
  });

  // --- Controls -------------------------------------------------------------

  // Optional groups can be switched off in the preferences pane (the
  // layouts are handled with the layout switch below).
  for (const el of document.querySelectorAll<HTMLElement>("[data-group]")) {
    const group = el.dataset.group as keyof GraphArg["controls"];
    if (arg.controls[group] === false) el.hidden = true;
  }

  // Legend and controls panel collapse to a single toggle line, so the
  // graph can use the whole window.
  for (const panel of ["legend", "controls"] as const) {
    const toggle = byId(`${panel}-toggle`);
    const body = byId(panel === "legend" ? "legend" : "controls-body");
    if (!toggle || !body) continue;
    toggle.textContent = strings[panel];
    const set = (collapsed: boolean): void => {
      body.hidden = collapsed;
      toggle.setAttribute("aria-expanded", String(!collapsed));
    };
    set(arg.collapsed[panel]);
    toggle.addEventListener("click", () => {
      const collapsed = !body.hidden;
      set(collapsed);
      arg.onCollapsedChange?.(panel, collapsed);
    });
  }

  // Layout switch: network, timeline (G11), ego network or layers; each
  // button explains its layout on hover.
  const layoutMount = byId("layout");
  const hints: Record<LayoutMode, string> = {
    network: strings.hintNetwork,
    timeline: strings.hintTimeline,
    ego: strings.hintEgo,
    layers: strings.hintLayers,
  };
  if (layoutMount) {
    // Network is always there; the other layouts are switched on one by
    // one in the preferences pane. Network alone needs no switch.
    const modes = (
      [
        ["network", strings.layoutNetwork],
        ["timeline", strings.layoutTimeline],
        ["ego", strings.layoutEgo],
        ["layers", strings.layoutLayers],
      ] as [LayoutMode, string][]
    ).filter(([m]) => m === "network" || arg.controls[m]);
    if (modes.length === 1) layoutMount.hidden = true;
    const buttons = modes.map(([m, label]) => {
      const b = create("button");
      b.textContent = label;
      b.title = hints[m];
      b.setAttribute("aria-pressed", String(m === mode));
      b.addEventListener("click", () => {
        if (m === mode) return;
        for (const other of buttons) {
          other.setAttribute("aria-pressed", String(other === b));
        }
        applyLayout(m);
      });
      return b;
    });
    layoutMount.append(...buttons);
  }

  // Search (G5): hits are outlined, their neighbourhood stays opaque, the
  // rest is dimmed; Enter centres the view on the first hit.
  const search = byId("search") as HTMLInputElement | null;
  const depthMount = byId("search-depth");
  if (search) {
    search.placeholder = strings.search;
    search.addEventListener("input", () => {
      query = search.value;
      if (depthMount) depthMount.hidden = !query.trim();
      refresh();
    });
    search.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        search.value = "";
        query = "";
        if (depthMount) depthMount.hidden = true;
        refresh();
        return;
      }
      if (e.key !== "Enter" || !view.hits || view.hits.size === 0) return;
      const first = current.nodes.find((n) => view.hits!.has(n.id));
      // Ego network: the first hit becomes the centre.
      if (mode === "ego" && first) {
        egoCenter = first.id;
        refresh();
        fitSoon();
        return;
      }
      if (first?.x !== undefined && first.y !== undefined) {
        graph.centerAt(first.x, first.y, 600);
        graph.zoom(Math.max(graph.zoom(), 2), 600);
      }
    });
  }
  depthMount?.appendChild(
    checkbox(strings.searchDepth2, false, (on) => {
      depth = on ? 2 : 1;
      refresh();
    }),
  );

  // Stance filter (G2).
  const stanceMount = byId("stance-filter");
  const stanceTitle = byId("stance-filter-label");
  if (stanceTitle) stanceTitle.textContent = strings.filterStances;
  for (const stance of STANCE_ORDER) {
    const pill = create("span");
    pill.className = "pill";
    pill.style.background = stanceColor(stance);
    pill.textContent = STANCE_GLYPH[stance];
    stanceMount?.appendChild(
      checkbox(
        pill,
        true,
        (on) => {
          if (on) shownStances.add(stance);
          else shownStances.delete(stance);
          refresh();
        },
        strings.stances[stance],
      ),
    );
  }
  const typeTitle = byId("type-filter-label");
  if (typeTitle) typeTitle.textContent = strings.filterTypes;

  const minInput = byId("min-links") as HTMLInputElement | null;
  const minLabel = byId("min-links-label");
  if (minInput) {
    if (minLabel) minLabel.textContent = strings.minLinks;
    minInput.value = "1";
    minInput.addEventListener("input", () => {
      const v = Math.floor(Number(minInput.value));
      minLinks = Number.isFinite(v) && v > 0 ? v : 1;
      refresh();
    });
  }

  byId("size-incoming")?.appendChild(
    checkbox(strings.sizeByIncoming, sizeByIncoming, (on) => {
      sizeByIncoming = on;
      refresh();
    }),
  );

  byId("tags")?.appendChild(tagSelect.root);
  const focusBox = byId("tag-focus") as HTMLInputElement | null;
  const focusLabel = byId("tag-focus-label");
  if (focusBox) {
    if (focusLabel) focusLabel.textContent = strings.tagFocus;
    focusBox.addEventListener("change", () => {
      tagFocus = focusBox.checked;
      refresh();
    });
  }

  const slider = byId("link-distance") as HTMLInputElement | null;
  const sliderLabel = byId("link-distance-label");
  if (slider) {
    if (sliderLabel) sliderLabel.textContent = strings.linkDistance;
    slider.value = String(arg.linkDistance);
    slider.addEventListener("input", () => {
      const v = Number(slider.value);
      applyDistance(v);
      arg.onLinkDistanceChange?.(v);
    });
  }

  // Scope switcher (N6): rebuild the data for the chosen library/collection.
  const scopeMount = byId("scope");
  const scopeLabel = byId("scope-label");
  if (scopeMount) {
    if (scopeLabel) scopeLabel.textContent = strings.scope;
    scopeMount.appendChild(
      buildScopeSelect(arg.scopes, (id) => {
        applyData(JSON.parse(arg.getScopedData(id)) as GraphData);
      }),
    );
  }

  // Live refresh (G6/L8): references or items changed in Zotero.
  onViewDataChanged(() => {
    applyData(JSON.parse(arg.getCurrentData()) as GraphData, true);
  });

  // Export (G8): what the window shows now, after scope, filters and search.
  const exportMount = byId("export");
  if (exportMount) {
    const visibleData = (): { items: ExportItem[]; refs: ExportRef[] } => {
      const items = new Map<number, ExportItem>();
      for (const n of current.nodes) {
        if (!view.visible.has(n.id)) continue;
        items.set(n.id, {
          id: n.id,
          label: n.label,
          year: n.year,
          itemType: n.itemType,
          uri: n.uri,
        });
      }
      const refs: ExportRef[] = [];
      for (const l of current.links) {
        const source = items.get(endId(l.source));
        const target = items.get(endId(l.target));
        if (!source || !target || !shownStances.has(l.stance)) continue;
        refs.push({
          source,
          target,
          stance: l.stance,
          comment: l.comment,
          sourcePages: l.sourcePages,
          targetPages: l.targetPages,
        });
      }
      return { items: [...items.values()], refs };
    };
    const png = (): string | null => {
      const canvas = container.querySelector("canvas");
      if (!canvas) return null;
      const out = create("canvas") as unknown as HTMLCanvasElement;
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext("2d") as CanvasRenderingContext2D | null;
      if (!ctx) return null;
      // The graph canvas is transparent; unless that is wanted (setting), give
      // the image the window background.
      if (!arg.exportTransparent()) {
        const bg = body ? getComputedStyle(body).backgroundColor : "";
        ctx.fillStyle =
          bg && bg !== "transparent" && !bg.endsWith(", 0)")
            ? bg
            : isDark
              ? "#1c1c1e"
              : "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);
      }
      ctx.drawImage(canvas, 0, 0);
      return out.toDataURL("image/png").split(",")[1] ?? null;
    };
    exportMount.appendChild(
      buildScopeSelect(
        [
          { id: "png", label: strings.exportPng },
          { id: "csv", label: strings.exportCsv },
          { id: "graphml", label: strings.exportGraphml },
        ],
        (id) => {
          const name = `qualified-references.${id}`;
          if (id === "png") {
            const b64 = png();
            if (b64) arg.saveExport(window, name, b64, true);
            return;
          }
          const { items, refs } = visibleData();
          arg.saveExport(
            window,
            name,
            id === "csv"
              ? referencesCsv(refs, strings.stances)
              : referencesGraphml(items, refs, strings.stances),
          );
        },
        { label: strings.export, alignRight: true },
      ),
    );
  }

  const resize = (): void => {
    graph.width(window.innerWidth).height(window.innerHeight);
  };
  resize();
  window.addEventListener("resize", resize);
}

main();
