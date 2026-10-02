import type { ReferenceLink } from "./types";

/**
 * How a backup is merged into an item's current references (S2). Pure, so it
 * is unit-tested without Zotero.
 *
 * - A reference in the backup that the item no longer has (same id) is added.
 * - A reference the item still has is replaced only when the backup's copy was
 *   modified later; the newer edit wins.
 * - References the item has but the backup lacks stay: a restore never deletes.
 */
export function mergeLinks(
  current: ReferenceLink[],
  backup: ReferenceLink[],
): { links: ReferenceLink[]; added: number; updated: number } {
  const links = current.slice();
  const byId = new Map(links.map((l, i) => [l.id, i]));
  let added = 0;
  let updated = 0;
  for (const b of backup) {
    const i = byId.get(b.id);
    if (i === undefined) {
      byId.set(b.id, links.length);
      links.push(b);
      added++;
    } else if (b.modified > links[i].modified) {
      links[i] = b;
      updated++;
    }
  }
  return { links, added, updated };
}
