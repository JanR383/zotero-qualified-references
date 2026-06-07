import type { Stance } from "../modules/types";

/**
 * Data contract between the plugin (graphView.ts) and the standalone graph
 * window (graph/index.ts). Passed via `window.arguments[0]` of the dialog —
 * the same process-local hand-off used by src/modules/picker.ts, so plain
 * objects and functions cross the boundary directly.
 */
export interface GraphNode {
  id: number; // Zotero item id (also the force-graph node id)
  label: string; // item.getDisplayTitle()
  tooltip: string; // HTML shown on hover (title + stance distribution)
  x?: number; // filled by the force engine at runtime
  y?: number;
}

export interface GraphLink {
  source: number; // source item id
  target: number; // target item id
  stance: Stance;
}

export interface GraphStrings {
  title: string;
  empty: string;
  legend: Record<"pp" | "p" | "o" | "m" | "mm", string>;
}

export interface GraphArg {
  nodes: GraphNode[];
  links: GraphLink[];
  strings: GraphStrings;
  selectItem: (id: number) => void;
}
