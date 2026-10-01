import { getString } from "../utils/locale";
import {
  itemUri,
  openViewWindow,
  viewArgBase,
  viewStringsBase,
  type ItemFilter,
} from "./navigation";
import { formatItem, itemYear, paneFields } from "./itemFormat";
import { forEachResolvedLink } from "./storage";
import type { ListArg, ListEntry, ListNode } from "../list/types";

/**
 * Builds the reference list from the in-memory reverse index and opens it in a
 * standalone window (same openDialog + window.arguments hand-off as the graph).
 * A flat list of all items that have references; each row expands to show the
 * connected items (outgoing / incoming) with their stance.
 */

function byStance(a: ListEntry, b: ListEntry): number {
  return b.stance - a.stance || a.label.localeCompare(b.label);
}

function buildNodes(filter?: ItemFilter): ListNode[] {
  const fields = paneFields();
  const nodes = new Map<number, ListNode>();

  const ensure = (item: Zotero.Item): ListNode => {
    let node = nodes.get(item.id);
    if (!node) {
      node = {
        id: item.id,
        label: formatItem(item, fields),
        year: itemYear(item),
        uri: itemUri(item),
        outgoing: [],
        incoming: [],
      };
      nodes.set(item.id, node);
    }
    return node;
  };

  forEachResolvedLink((source, target, link) => {
    const sNode = ensure(source);
    const tNode = ensure(target);
    const details = {
      stance: link.stance,
      linkId: link.id,
      comment: link.comment,
      sourcePages: link.sourcePages,
      targetPages: link.targetPages,
    };
    sNode.outgoing.push({ ...details, id: target.id, label: tNode.label });
    tNode.incoming.push({ ...details, id: source.id, label: sNode.label });
  }, filter);

  const result = [...nodes.values()];
  for (const node of result) {
    node.outgoing.sort(byStance);
    node.incoming.sort(byStance);
  }
  result.sort((a, b) => a.label.localeCompare(b.label));
  return result;
}

export function openListView(win: Window): void {
  const arg: ListArg = {
    ...viewArgBase((filter) => ({ nodes: buildNodes(filter) })),
    nodes: buildNodes(),
    strings: {
      ...viewStringsBase("list-window-title"),
      outgoing: getString("graph-out"),
      incoming: getString("graph-in"),
      noMatch: getString("list-no-match"),
      search: getString("list-search"),
      expandAll: getString("list-expand-all"),
      collapseAll: getString("list-collapse-all"),
      sort: getString("list-sort"),
      sortAlpha: getString("list-sort-alpha"),
      sortCount: getString("list-sort-count"),
      sortYear: getString("list-sort-year"),
      exportMd: getString("export-md"),
    },
  };

  openViewWindow(win, "list", { width: 700, height: 720 }, arg);
}
