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
import { STANCE_CSS_VAR, STANCE_GLYPH } from "../modules/stanceMeta";
import { byId, create } from "../shared/dom";
import { buildScopeSelect } from "../shared/scopeSelect";
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

const LEGEND_ORDER: { key: keyof GraphStrings["legend"]; stance: Stance }[] = [
  { key: "pp", stance: 2 },
  { key: "p", stance: 1 },
  { key: "o", stance: 0 },
  { key: "m", stance: -1 },
  { key: "mm", stance: -2 },
];

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
  isDark: boolean,
): void {
  const legend = byId("legend");
  if (!legend) return;
  legend.replaceChildren(); // re-rendered on scope change
  // Edge colours = stance.
  for (const { key, stance } of LEGEND_ORDER) {
    legend.appendChild(
      legendRow(
        stanceColor(stance),
        `${STANCE_GLYPH[stance]}  ${arg.strings.legend[key]}`,
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
}

function main(): void {
  const arg = window.arguments?.[0] as GraphArg | undefined;
  if (!arg) return;

  document.title = arg.strings.title;

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
    empty.textContent = arg.strings.empty;
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

  const R = 8; // node "radius" in graph units (symbol size + hit area)
  const graph = new ForceGraph<GraphNode, GraphLink>(container)
    .graphData({ nodes: [], links: [] })
    .nodeId("id")
    .nodeLabel((n) => n.tooltip)
    // Tell force-graph the real node radius so its built-in arrow placement
    // (which insets the tip by the target's radius) stops the arrowhead at the
    // node border instead of overlapping our custom R=8 shapes. nodeRelSize is
    // the circle radius per unit nodeVal (default 1), so this yields endR = R.
    .nodeRelSize(R)
    .linkColor((l) => colorFor(l.stance))
    .linkWidth(1.5)
    .linkCurvature("curvature")
    .linkDirectionalArrowLength(7)
    .linkDirectionalArrowColor((l) => colorFor(l.stance))
    .linkDirectionalArrowRelPos(1)
    .onNodeClick((n) => arg.selectItem(n.id))
    // Custom node rendering: shape by item type (N5b), filled with the type
    // colour (or a uniform colour when colour-by-type is off), plus the label.
    .nodeCanvasObjectMode(() => "replace")
    .nodeCanvasObject((n, ctx, scale) => {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      pathShape(ctx, typeShape(n.itemType), x, y, R);
      ctx.fillStyle = arg.colorByType
        ? typeColor(n.itemType, isDark)
        : nodeColor;
      ctx.fill();
      const fontSize = 12 / scale;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const text = n.label.length > 40 ? `${n.label.slice(0, 39)}…` : n.label;
      const ly = y + R + 2 / scale;
      // Contrasting halo behind the label so it stays legible over edges/nodes.
      ctx.lineWidth = 3 / scale;
      ctx.lineJoin = "round";
      ctx.strokeStyle = haloColor;
      ctx.strokeText(text, x, ly);
      ctx.fillStyle = labelColor;
      ctx.fillText(text, x, ly);
    })
    // Paint the clickable hit area to match the drawn shape.
    .nodePointerAreaPaint((n, color, ctx) => {
      pathShape(ctx, typeShape(n.itemType), n.x ?? 0, n.y ?? 0, R);
      ctx.fillStyle = color;
      ctx.fill();
    });

  // Edge-length control: set the initial force-link distance and wire the
  // in-window slider so dense graphs can be spread out for legibility.
  const linkForce = graph.d3Force("link") as
    { distance: (d: number) => unknown } | undefined;
  const applyDistance = (d: number): void => {
    linkForce?.distance(d);
    graph.d3ReheatSimulation();
  };
  applyDistance(arg.linkDistance);

  // (Re)load the graph data, edge curvature and type legend for a scope.
  const applyData = (data: GraphData): void => {
    computeCurvature(data.links);
    graph.graphData({ nodes: data.nodes, links: data.links });
    renderLegend(arg, data.typeLegend, isDark);
    showEmpty(data.nodes.length === 0);
  };
  applyData({
    nodes: arg.nodes,
    links: arg.links,
    typeLegend: arg.typeLegend,
  });

  const slider = byId("link-distance") as HTMLInputElement | null;
  const sliderLabel = byId("link-distance-label");
  if (slider) {
    if (sliderLabel) sliderLabel.textContent = arg.strings.linkDistance;
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
    if (scopeLabel) scopeLabel.textContent = arg.strings.scope;
    scopeMount.appendChild(
      buildScopeSelect(arg.scopes, (id) => {
        applyData(JSON.parse(arg.getScopedData(id)) as GraphData);
      }),
    );
  }

  const resize = (): void => {
    graph.width(window.innerWidth).height(window.innerHeight);
  };
  resize();
  window.addEventListener("resize", resize);
}

main();
