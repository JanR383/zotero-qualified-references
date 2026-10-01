import { getString } from "../utils/locale";
import { openViewWindow, viewArgBase, viewStringsBase } from "./navigation";
import { formatItem, paneFields } from "./itemFormat";
import { forEachResolvedLink } from "./storage";
import { makePredicate } from "./scope";
import { zDate } from "../utils/zoteroApis";
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

function itemYear(item: Zotero.Item): number | null {
  const date = (item.getField("date") as string) || "";
  const year = date ? Number(zDate().strToDate(date)?.year) : NaN;
  return Number.isFinite(year) ? year : null;
}

function buildNodes(scopeId = "all"): ListNode[] {
  const fields = paneFields();
  const nodes = new Map<number, ListNode>();

  const ensure = (item: Zotero.Item): ListNode => {
    let node = nodes.get(item.id);
    if (!node) {
      node = {
        id: item.id,
        label: formatItem(item, fields),
        year: itemYear(item),
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
    sNode.outgoing.push({
      stance: link.stance,
      id: target.id,
      label: tNode.label,
    });
    tNode.incoming.push({
      stance: link.stance,
      id: source.id,
      label: sNode.label,
    });
  }, makePredicate(scopeId));

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
    ...viewArgBase((id) => ({ nodes: buildNodes(id) })),
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
    },
  };

  openViewWindow(win, "list", { width: 700, height: 720 }, arg);
}
