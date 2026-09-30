import type { Stance } from "../modules/types";
import type { ViewArgBase, ViewStringsBase } from "../shared/viewArg";
import type { TagOption } from "../modules/tagHighlight";

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
  tags: string[]; // the item's tag names (for tag highlighting, G12)
  x?: number; // filled by the force engine at runtime
  y?: number;
}

export interface GraphLink {
  source: number; // source item id
  target: number; // target item id
  stance: Stance;
  curvature?: number; // arc bow, set by the renderer to separate parallel edges
}

export interface GraphStrings extends ViewStringsBase {
  linkDistance: string;
  tags: string;
  tagsFilter: string;
  tagsNone: string;
  tagFocus: string;
}

/** Scoped data the window re-requests when the user switches scope (N6). */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  typeLegend: { type: string; label: string }[];
  tagOptions: TagOption[];
}

export interface GraphArg extends ViewArgBase {
  nodes: GraphNode[];
  links: GraphLink[];
  strings: GraphStrings;
  /** Colour nodes by item type (N5). */
  colorByType: boolean;
  /** Localized labels for the item types present (legend, N5). */
  typeLegend: { type: string; label: string }[];
  /** Tags present on the initial nodes, offered for highlighting (G12). */
  tagOptions: TagOption[];
  /** Tags selected for highlighting (lower-cased), restored from prefs. */
  highlightTags: string[];
  /** Persist a changed tag selection back to prefs. */
  onHighlightTagsChange?: (tags: string[]) => void;
  /** Initial force-link distance (edge length) from prefs. */
  linkDistance: number;
  /** Persist a changed link distance back to prefs. */
  onLinkDistanceChange?: (v: number) => void;
}
