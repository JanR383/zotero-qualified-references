import { getString } from "../utils/locale";
import {
  itemUri,
  openViewWindow,
  viewArgBase,
  viewStringsBase,
  type ItemFilter,
} from "./navigation";
import { formatItem, itemYear, paneFields } from "./itemFormat";
import { tagHighlightArg, tagSelectStrings } from "./graphView";
import { forEachResolvedLink } from "./storage";
import { collectTagOptions, loadTagColors } from "./tagHighlight";
import type { ListArg, ListData, ListEntry, ListNode } from "../list/types";

/**
 * Builds the reference list from the in-memory reverse index and opens it in a
 * standalone window (same openDialog + window.arguments hand-off as the graph).
 * A flat list of all items that have references; each row expands to show the
 * connected items (outgoing / incoming) with their stance.
 */

function byStance(a: ListEntry, b: ListEntry): number {
  return b.stance - a.stance || a.label.localeCompare(b.label);
}

function buildData(filter?: ItemFilter): ListData {
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
        tags: item.getTags().map((t) => t.tag),
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
      hasAnchor: !!(link.sourceAttachmentKey && link.sourceAnnotationKey),
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
  // Tags offered for highlighting (C2): all tags present in this scope.
  const tagOptions = collectTagOptions(
    result.map((n) => n.tags),
    loadTagColors(),
  );
  return { nodes: result, tagOptions };
}

export function openListView(win: Window): void {
  const data = buildData();
  const arg: ListArg = {
    ...viewArgBase(buildData),
    ...tagHighlightArg(data.tagOptions),
    nodes: data.nodes,
    strings: {
      ...viewStringsBase("list-window-title"),
      ...tagSelectStrings(),
      showTagged: getString("list-show-tagged"),
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

  openViewWindow(win, "list", { width: 960, height: 720 }, arg);
}
