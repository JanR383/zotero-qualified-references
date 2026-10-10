import type { Stance } from "../modules/types";
import type { TagOption } from "../modules/tagHighlight";
import type { TagHighlightArg, TagSelectStrings } from "../shared/tagSelect";
import type { ViewArgBase, ViewStringsBase } from "../shared/viewArg";

/**
 * Data contract between the plugin (listView.ts) and the standalone list window
 * (list/index.ts), handed over via `window.arguments[0]` (like the graph).
 */
export interface ListEntry {
  stance: Stance;
  id: number; // the connected item's id (click → select in Zotero)
  label: string; // formatItem(otherItem, paneFields())
  linkId: string; // the reference's id within its source item
  comment?: string;
  sourcePages?: string;
  targetPages?: string;
  hasAnchor: boolean; // a PDF anchor exists (L4: link to the passage)
}

export interface ListNode {
  id: number;
  label: string;
  year: number | null; // parsed from the date field, for sorting (L5)
  uri: string; // zotero://select link (export, L7)
  tags: string[]; // the item's tag names (for tag highlighting, C2)
  outgoing: ListEntry[]; // references this item makes
  incoming: ListEntry[]; // references pointing at this item
}

export interface ListStrings extends ViewStringsBase, TagSelectStrings {
  outgoing: string;
  incoming: string;
  noMatch: string;
  search: string;
  expandAll: string;
  collapseAll: string;
  sort: string;
  sortAlpha: string;
  sortIncoming: string;
  sortOutgoing: string;
  sortYear: string;
  show: string;
  showAll: string;
  showEvaluated: string;
  showCited: string;
  showContested: string;
  showTagged: string;
  showUnevaluated: string;
  contested: string;
  exportMd: string;
  openPdf: string;
  openPdfTitle: string;
  showComment: string;
}

/** Scoped data the window re-requests on scope change and live refresh. */
export interface ListData {
  nodes: ListNode[];
  tagOptions: TagOption[];
}

export interface ListArg extends ViewArgBase, TagHighlightArg {
  nodes: ListNode[];
  strings: ListStrings;
}
