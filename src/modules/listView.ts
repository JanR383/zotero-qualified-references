import { getString } from "../utils/locale";
import {
  itemUri,
  openViewWindow,
  viewArgBase,
  viewStringsBase,
  type ItemFilter,
} from "./navigation";
import { formatItem, itemYear, paneFields } from "./itemFormat";
import { loadHighlightColors, loadHighlightTags } from "./graphView";
import { getCurrentPaletteId } from "./stancePalette";
import { forEachResolvedLink } from "./storage";
import {
  assignTagColors,
  collectTagOptions,
  loadTagColors,
  TAG_PALETTE,
  TAG_PALETTE_COLORBLIND,
  tagKey,
} from "./tagHighlight";
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
  const itemTags = new Map<number, string[]>();

  const ensure = (item: Zotero.Item): ListNode => {
    let node = nodes.get(item.id);
    if (!node) {
      node = {
        id: item.id,
        label: formatItem(item, fields),
        year: itemYear(item),
        uri: itemUri(item),
        tags: [],
        outgoing: [],
        incoming: [],
      };
      nodes.set(item.id, node);
      itemTags.set(
        item.id,
        item.getTags().map((t) => t.tag),
      );
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
      hasAnchor: !!(link.sourceAttachmentKey && link.sourceAnnotationKey),
    };
    sNode.outgoing.push({ ...details, id: target.id, label: tNode.label });
    tNode.incoming.push({ ...details, id: source.id, label: sNode.label });
  }, filter);

  // Tags highlighted in the graph window (C2), in the same colours.
  const assigned = assignTagColors(
    loadHighlightTags(),
    collectTagOptions([...itemTags.values()], loadTagColors()),
    getCurrentPaletteId() === "colorblind"
      ? TAG_PALETTE_COLORBLIND
      : TAG_PALETTE,
    new Map(Object.entries(loadHighlightColors())),
  );
  const result = [...nodes.values()];
  if (assigned.size > 0) {
    for (const node of result) {
      const own = new Set((itemTags.get(node.id) ?? []).map(tagKey));
      node.tags = [...assigned]
        .filter(([key]) => own.has(key))
        .map(([, tag]) => tag);
    }
  }
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
      sortIncoming: getString("list-sort-incoming"),
      sortOutgoing: getString("list-sort-outgoing"),
      sortYear: getString("list-sort-year"),
      show: getString("list-show"),
      showAll: getString("list-show-all"),
      showEvaluated: getString("list-show-evaluated"),
      showCited: getString("list-show-cited"),
      showContested: getString("list-show-contested"),
      showUnevaluated: getString("list-show-unevaluated"),
      contested: getString("list-contested"),
      exportMd: getString("export-md"),
      openPdf: getString("list-open-pdf"),
      openPdfTitle: getString("list-open-pdf-title"),
      showComment: getString("list-show-comment"),
    },
  };

  openViewWindow(win, "list", { width: 900, height: 720 }, arg);
}
