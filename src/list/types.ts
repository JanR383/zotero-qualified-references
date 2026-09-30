import type { Stance } from "../modules/types";
import type { ViewArgBase, ViewStringsBase } from "../shared/viewArg";

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

export interface ListStrings extends ViewStringsBase {
  outgoing: string;
  incoming: string;
  noMatch: string;
  search: string;
  expandAll: string;
  collapseAll: string;
}

export interface ListArg extends ViewArgBase {
  nodes: ListNode[];
  strings: ListStrings;
}
