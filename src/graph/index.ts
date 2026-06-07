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
import type { Stance } from "../modules/types";
import type { GraphArg, GraphLink, GraphNode, GraphStrings } from "./types";

// This module runs in a real browser-like window (graph.xhtml). The plugin's
// tsconfig (zotero-types sandbox) provides DOM *types* but not the browser
// global *values*, so declare the few we use here.
declare const window: Window & typeof globalThis & { arguments?: unknown[] };
declare const document: Document;
declare function getComputedStyle(
  elt: Element,
  pseudoElt?: string | null,
): CSSStyleDeclaration;

// The sandbox lib types createElement/getElementById as returning the base
// Element; wrap them so we get HTMLElement (with .style etc.).
function byId(id: string): HTMLElement | null {
  return document.getElementById(id) as HTMLElement | null;
}
function create(tag: string): HTMLElement {
  return document.createElement(tag) as unknown as HTMLElement;
}

const STANCE_VAR: Record<Stance, string> = {
  2: "--qref-stance-strong-pos",
  1: "--qref-stance-pos",
  0: "--qref-stance-neutral",
  [-1]: "--qref-stance-neg",
  [-2]: "--qref-stance-strong-neg",
};

const STANCE_GLYPH: Record<keyof GraphStrings["legend"], string> = {
  pp: "++",
  p: "+",
  o: "0",
  m: "−",
  mm: "−−",
};

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
  return cssVar(STANCE_VAR[stance]) || "#888888";
}

function renderLegend(strings: GraphStrings): void {
  const legend = byId("legend");
  if (!legend) return;
  for (const { key, stance } of LEGEND_ORDER) {
    const row = create("div");
    row.className = "legend-row";
    const swatch = create("span");
    swatch.className = "legend-swatch";
    swatch.style.background = stanceColor(stance);
    const text = create("span");
    text.textContent = `${STANCE_GLYPH[key]}  ${strings.legend[key]}`;
    row.append(swatch, text);
    legend.appendChild(row);
  }
}

function main(): void {
  const arg = window.arguments?.[0] as GraphArg | undefined;
  if (!arg) return;

  document.title = arg.strings.title;
  renderLegend(arg.strings);

  if (arg.nodes.length === 0) {
    const empty = byId("empty");
    if (empty) {
      empty.textContent = arg.strings.empty;
      empty.style.display = "block";
    }
    return;
  }

  const container = byId("graph");
  if (!container) return;

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

  const graph = new ForceGraph<GraphNode, GraphLink>(container)
    .graphData({ nodes: arg.nodes, links: arg.links })
    .nodeId("id")
    .nodeRelSize(5)
    .nodeColor(() => nodeColor)
    .nodeLabel((n) => n.tooltip)
    .linkColor((l) => colorFor(l.stance))
    .linkWidth(1.5)
    .linkDirectionalArrowLength(5)
    .linkDirectionalArrowColor((l) => colorFor(l.stance))
    .linkDirectionalArrowRelPos(1)
    .onNodeClick((n) => arg.selectItem(n.id))
    .nodeCanvasObjectMode(() => "after")
    .nodeCanvasObject((n, ctx, scale) => {
      const fontSize = 12 / scale;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = labelColor;
      const max = 40;
      const text =
        n.label.length > max ? `${n.label.slice(0, max - 1)}…` : n.label;
      ctx.fillText(text, n.x ?? 0, (n.y ?? 0) + 7 / scale);
    });

  const resize = (): void => {
    graph.width(window.innerWidth).height(window.innerHeight);
  };
  resize();
  window.addEventListener("resize", resize);
}

main();
