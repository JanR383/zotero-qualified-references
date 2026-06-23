import type { Stance } from "../modules/types";
import type { ScopeOption } from "../modules/scope";

/**
 * Data contract between the plugin (graphView.ts) and the standalone graph
 * window (graph/index.ts). Passed via `window.arguments[0]` of the dialog —
 * the same process-local hand-off used by src/modules/picker.ts, so plain
 * objects and functions cross the boundary directly.
 */
export interface GraphNode {
  id: number; // Zotero item id (also the force-graph node id)
  label: string; // formatItem(item, graphFields())
  itemType: string; // Zotero item type (for colour-by-type, N5)
  tooltip: string; // HTML shown on hover (header + type + stance pills)
  x?: number; // filled by the force engine at runtime
  y?: number;
}

export interface GraphLink {
  source: number; // source item id
  target: number; // target item id
  stance: Stance;
  curvature?: number; // arc bow, set by the renderer to separate parallel edges
}

export interface GraphStrings {
  title: string;
  empty: string;
  legend: Record<"pp" | "p" | "o" | "m" | "mm", string>;
  linkDistance: string;
  scope: string;
}

/** Scoped data the window re-requests when the user switches scope (N6). */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  typeLegend: { type: string; label: string }[];
}

export interface GraphArg {
  nodes: GraphNode[];
  links: GraphLink[];
  strings: GraphStrings;
  selectItem: (id: number) => void;
  /** Optional stance-palette override CSS (M7); injected before reading vars. */
  paletteCss?: string;
  /** Colour nodes by item type (N5). */
  colorByType: boolean;
  /** Localized labels for the item types present (legend, N5). */
  typeLegend: { type: string; label: string }[];
  /** Initial force-link distance (edge length) from prefs. */
  linkDistance: number;
  /** Persist a changed link distance back to prefs. */
  onLinkDistanceChange?: (v: number) => void;
  /** Scope dropdown options (N6); first is "all", matching the initial nodes. */
  scopes: ScopeOption[];
  /**
   * Rebuild nodes/links/legend for a scope id, returned as a JSON string of
   * GraphData. The graph runs in a separate window: a plain object returned by
   * this parent-side function would cross as an Xray wrapper and read as empty,
   * so we serialize and JSON.parse it back into native objects in the window.
   */
  getScopedData: (id: string) => string;
}
