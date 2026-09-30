import type { Stance } from "../modules/types";
import type { ScopeOption } from "../modules/scope";

/**
 * Data contract between the plugin (listView.ts) and the standalone list window
 * (list/index.ts), handed over via `window.arguments[0]` (like the graph).
 */
export interface ListEntry {
  stance: Stance;
  id: number; // the connected item's id (click → select in Zotero)
  label: string; // formatItem(otherItem, paneFields())
}

export interface ListNode {
  id: number;
  label: string;
  outgoing: ListEntry[]; // references this item makes
  incoming: ListEntry[]; // references pointing at this item
}

export interface ListStrings {
  title: string;
  empty: string;
  outgoing: string;
  incoming: string;
  scope: string;
  noMatch: string;
  search: string;
  expandAll: string;
  collapseAll: string;
  /** Localized stance names, shown as tooltips on the filter checkboxes. */
  stances: Record<Stance, string>;
}

export interface ListArg {
  nodes: ListNode[];
  strings: ListStrings;
  selectItem: (id: number) => void;
  paletteCss?: string;
  /** Scope dropdown options (N6); first is "all", matching the initial nodes. */
  scopes: ScopeOption[];
  /**
   * Rebuild nodes for a scope id, returned as a JSON string of `{ nodes }`. The
   * list runs in a separate window, so a returned object would cross as an Xray
   * wrapper and read as empty; we serialize and JSON.parse it back in the window.
   */
  getScopedData: (id: string) => string;
}
