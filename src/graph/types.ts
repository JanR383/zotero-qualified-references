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
  year: number | null; // publication year (timeline layout, G11)
  x?: number; // filled by the force engine at runtime
  y?: number;
  fx?: number; // fixed x in the timeline layout
  vy?: number;
}

export interface GraphLink {
  id: string; // the reference's id within its source item
  source: number; // source item id
  target: number; // target item id
  stance: Stance;
  // Edge details (G3), shown on hover.
  comment?: string;
  sourcePages?: string;
  targetPages?: string;
  hasAnchor: boolean; // a PDF anchor exists (click opens it)
  curvature?: number; // arc bow, set by the renderer to separate parallel edges
}

export interface GraphStrings extends ViewStringsBase {
  linkDistance: string;
  layoutNetwork: string;
  layoutTimeline: string;
  undated: string;
  search: string;
  searchDepth2: string;
  filters: string;
  filterStances: string;
  filterTypes: string;
  minLinks: string;
  sizeByIncoming: string;
  sourcePages: string;
  targetPages: string;
  linkOpenPdf: string;
  linkSelect: string;
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
  /** Every item type present, localized, for the type filter (G2). */
  itemTypes: { type: string; label: string }[];
  tagOptions: TagOption[];
}

export type GraphControlGroup =
  "search" | "filters" | "tags" | "size" | "distance" | "timeline";

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
  /** Open the source PDF at the reference's anchor (G3). */
  openAnchor: (sourceId: number, linkId: string) => void;
  /** Optional control groups shown in the window (from prefs). */
  controls: Record<GraphControlGroup, boolean>;
  /** Item types present in the initial data (G2). */
  itemTypes: { type: string; label: string }[];
}
