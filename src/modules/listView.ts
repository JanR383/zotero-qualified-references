import { getString } from "../utils/locale";
import { formatItem, paneFields } from "./itemFormat";
import { getCurrentPaletteId, paletteOverrideCss } from "./stancePalette";
import type { Stance } from "./types";
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

function buildNodes(): ListNode[] {
  const index = addon.data.incomingIndex;
  const fields = paneFields();
  const nodes = new Map<number, ListNode>();
  const labels = new Map<number, string>();

  const ensure = (item: Zotero.Item): ListNode => {
    let node = nodes.get(item.id);
    if (!node) {
      const label = formatItem(item, fields);
      labels.set(item.id, label);
      node = { id: item.id, label, outgoing: [], incoming: [] };
      nodes.set(item.id, node);
    }
    return node;
  };

  for (const list of index.values()) {
    for (const inc of list) {
      const source = Zotero.Items.get(inc.sourceID);
      const target = Zotero.Items.getByLibraryAndKey(
        inc.link.targetLib,
        inc.link.targetKey,
      );
      if (!source || !target) continue;
      const sNode = ensure(source);
      const tNode = ensure(target);
      const stance = inc.link.stance as Stance;
      sNode.outgoing.push({ stance, id: target.id, label: tNode.label });
      tNode.incoming.push({ stance, id: source.id, label: sNode.label });
    }
  }

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
    },
    selectItem: (id: number) => {
      Zotero.getActiveZoteroPane()?.selectItem(id);
    },
    paletteCss: paletteOverrideCss(getCurrentPaletteId()),
  };

  (win as unknown as { openDialog: (...a: unknown[]) => void }).openDialog(
    "chrome://qref/content/list.xhtml",
    "qref-list",
    "chrome,resizable,centerscreen,width=700,height=720",
    arg,
  );
}
