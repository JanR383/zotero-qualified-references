import type { ExportItem, ExportRef } from "../shared/export";
import type { ListNode } from "./types";

/**
 * What the list window exports (L7): the visible rows in their current order,
 * and every reference shown in them, each once (a reference between two
 * visible rows appears as outgoing in one and incoming in the other).
 * `all` is the scope's full data, to describe the other end of a reference
 * whose row is filtered out.
 */
export function listExportData(
  visible: ListNode[],
  all: ListNode[],
): { items: ExportItem[]; refs: ExportRef[] } {
  const byId = new Map<number, ExportItem>();
  const item = (id: number): ExportItem | undefined => {
    let e = byId.get(id);
    if (!e) {
      const n = all.find((x) => x.id === id);
      if (!n) return undefined;
      e = { id: n.id, label: n.label, year: n.year, uri: n.uri };
      byId.set(id, e);
    }
    return e;
  };

  const items: ExportItem[] = [];
  const refs: ExportRef[] = [];
  const seen = new Set<string>();
  for (const node of visible) {
    const self = item(node.id)!;
    items.push(self);
    const add = (
      sourceId: number,
      targetId: number,
      e: ListNode["outgoing"][number],
    ) => {
      const key = `${sourceId}:${e.linkId}`;
      if (seen.has(key)) return;
      const source = item(sourceId);
      const target = item(targetId);
      if (!source || !target) return;
      seen.add(key);
      refs.push({
        source,
        target,
        stance: e.stance,
        comment: e.comment,
        sourcePages: e.sourcePages,
        targetPages: e.targetPages,
      });
    };
    for (const e of node.outgoing) add(node.id, e.id, e);
    for (const e of node.incoming) add(e.id, node.id, e);
  }
  return { items, refs };
}
