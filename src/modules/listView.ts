import { getString } from "../utils/locale";
import { openViewWindow, selectItemInPane } from "./navigation";
import { formatItem, paneFields } from "./itemFormat";
import { getCurrentPaletteId, paletteOverrideCss } from "./stancePalette";
import { forEachResolvedLink } from "./storage";
import { buildScopeOptions, makePredicate } from "./scope";
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

function buildNodes(scopeId = "all"): ListNode[] {
  const fields = paneFields();
  const nodes = new Map<number, ListNode>();

  const ensure = (item: Zotero.Item): ListNode => {
    let node = nodes.get(item.id);
    if (!node) {
      node = {
        id: item.id,
        label: formatItem(item, fields),
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
    nodes: buildNodes(),
    strings: {
      title: getString("list-window-title"),
      empty: getString("graph-empty"),
      outgoing: getString("graph-out"),
      incoming: getString("graph-in"),
      scope: getString("scope-label"),
    },
    selectItem: selectItemInPane,
    paletteCss: paletteOverrideCss(getCurrentPaletteId()),
    scopes: buildScopeOptions(),
    getScopedData: (id: string) => JSON.stringify({ nodes: buildNodes(id) }),
  };

  openViewWindow(
    win,
    "chrome://qref/content/list.xhtml",
    "qref-list",
    "chrome,resizable,centerscreen,width=700,height=720",
    arg,
  );
}
