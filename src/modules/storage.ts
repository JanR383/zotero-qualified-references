import { zItems } from "../utils/zoteroApis";
import type { IncomingLink, ReferenceLink, Stance } from "./types";

/**
 * Storage layer for qualified references.
 *
 * Source of truth = a single line in the source item's synced "Extra" field:
 *   Reference-Graph: <JSON array of ReferenceLink>
 * "Reference-Graph" is not a CSL variable, so CSL/BibTeX parsers ignore it. The
 * line stays single-line (JSON.stringify escapes newlines), so multi-line
 * comments are safe.
 *
 * Everything outward-facing goes through this module so the underlying storage
 * (Extra field today, possibly a dedicated note later) can be swapped without
 * touching the UI.
 */

const EXTRA_KEY = "Reference-Graph";
const EXTRA_LINE_RE = new RegExp(`^${EXTRA_KEY}:\\s*(.*)$`);

function indexKey(lib: number, key: string): string {
  return `${lib}:${key}`;
}

function uuid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeLink(
  targetKey: string,
  targetLib: number,
  stance: Stance = 0,
): ReferenceLink {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    targetKey,
    targetLib,
    stance,
    added: now,
    modified: now,
  };
}

// --- Read/write the source item's links -----------------------------------

// The Reference-Graph line is untrusted input: in group libraries any member
// can edit Extra, and synced data may be malformed. Validate every entry
// before it reaches the index or the UI.

const MAX_FIELD_LENGTH = 10_000;

function asCappedString(value: unknown): string | undefined {
  return typeof value === "string"
    ? value.slice(0, MAX_FIELD_LENGTH)
    : undefined;
}

/** Validate one parsed entry; returns a clean ReferenceLink or null to drop. */
function sanitizeLink(raw: unknown): ReferenceLink | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  // Required identity fields — drop the entry if they are unusable.
  if (typeof o.id !== "string" || o.id.length === 0) return null;
  if (typeof o.targetKey !== "string" || o.targetKey.length === 0) return null;
  if (typeof o.targetLib !== "number" || !Number.isInteger(o.targetLib)) {
    return null;
  }
  // Stance: clamp to the known scale, defaulting to neutral.
  const stance: Stance =
    typeof o.stance === "number" && [-2, -1, 0, 1, 2].includes(o.stance)
      ? (o.stance as Stance)
      : 0;
  return {
    id: o.id.slice(0, 100),
    targetKey: o.targetKey.slice(0, 100),
    targetLib: o.targetLib,
    stance,
    sourcePages: asCappedString(o.sourcePages),
    targetPages: asCappedString(o.targetPages),
    sourceAttachmentKey: asCappedString(o.sourceAttachmentKey)?.slice(0, 100),
    sourceAnnotationKey: asCappedString(o.sourceAnnotationKey)?.slice(0, 100),
    comment: asCappedString(o.comment),
    added: asCappedString(o.added) ?? "",
    modified: asCappedString(o.modified) ?? "",
  };
}

export function getLinks(item: Zotero.Item): ReferenceLink[] {
  const extra = item.getField("extra") || "";
  for (const line of extra.split(/\r?\n/)) {
    const m = line.match(EXTRA_LINE_RE);
    if (!m) continue;
    try {
      const parsed = JSON.parse(m[1]);
      if (!Array.isArray(parsed)) {
        ztoolkit.log(
          `QRef: Reference-Graph on item ${item.libraryID}:${item.key} is not an array — ignoring`,
        );
        return [];
      }
      return parsed
        .map(sanitizeLink)
        .filter((l): l is ReferenceLink => l !== null);
    } catch (e) {
      ztoolkit.log(
        `QRef: failed to parse Reference-Graph on item ${item.libraryID}:${item.key}`,
        e,
      );
      return [];
    }
  }
  return [];
}

/**
 * Persist the given links onto the source item (replacing the existing
 * Reference-Graph line) and save. The notifier keeps the reverse index fresh.
 */
export async function setLinks(
  item: Zotero.Item,
  links: ReferenceLink[],
): Promise<void> {
  const extra = item.getField("extra") || "";
  const kept = extra.split(/\r?\n/).filter((line) => !EXTRA_LINE_RE.test(line));
  if (links.length > 0) {
    kept.push(`${EXTRA_KEY}: ${JSON.stringify(links)}`);
  }
  // Drop leading/trailing empties left behind by removing our line.
  item.setField("extra", kept.join("\n").replace(/^\n+|\n+$/g, ""));
  await item.saveTx();
}

// --- Reverse index ----------------------------------------------------------

function index(): Map<string, IncomingLink[]> {
  return addon.data.incomingIndex;
}

function bySource(): Map<number, Set<string>> {
  return addon.data.incomingBySource;
}

function removeSourceFromIndex(sourceID: number): void {
  // Only touch the target keys this source actually contributed to (O(targets))
  // instead of scanning the whole index (O(n)).
  const keys = bySource().get(sourceID);
  if (!keys) return;
  const map = index();
  for (const key of keys) {
    const list = map.get(key);
    if (!list) continue;
    const filtered = list.filter((l) => l.sourceID !== sourceID);
    if (filtered.length === 0) map.delete(key);
    else map.set(key, filtered);
  }
  bySource().delete(sourceID);
}

function addSourceToIndex(item: Zotero.Item): void {
  // Idempotent: a concurrent notifier event (during the background rebuild) may
  // already have indexed this source — drop it first to avoid duplicate entries.
  if (bySource().has(item.id)) removeSourceFromIndex(item.id);
  const map = index();
  const keys = new Set<string>();
  for (const link of getLinks(item)) {
    const key = indexKey(link.targetLib, link.targetKey);
    const entry: IncomingLink = {
      sourceID: item.id,
      sourceKey: item.key,
      sourceLib: item.libraryID,
      link,
    };
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
    keys.add(key);
  }
  if (keys.size > 0) bySource().set(item.id, keys);
}

/** Incoming references pointing at `item` (read-only reverse view). */
export function getIncoming(item: Zotero.Item): IncomingLink[] {
  return index().get(indexKey(item.libraryID, item.key)) || [];
}

/**
 * Walk every link in the reverse index with source and target resolved to live
 * items (entries whose items are gone are skipped). Used by the graph and list
 * views to build their data without duplicating the resolution logic.
 *
 * An optional `accept` predicate scopes the walk (N6): a link is yielded only
 * when BOTH endpoints pass, so a scoped view is a self-contained sub-graph.
 */
export function forEachResolvedLink(
  cb: (source: Zotero.Item, target: Zotero.Item, link: ReferenceLink) => void,
  accept?: (item: Zotero.Item) => boolean,
): void {
  for (const list of index().values()) {
    for (const inc of list) {
      const source = Zotero.Items.get(inc.sourceID);
      const target = Zotero.Items.getByLibraryAndKey(
        inc.link.targetLib,
        inc.link.targetKey,
      );
      if (!source || !target) continue;
      if (accept && (!accept(source) || !accept(target))) continue;
      cb(source, target, inc.link);
    }
  }
}

/**
 * Rebuild the reverse index.
 *
 * Strategy:
 *   1. Query the DB for all item IDs in the library (plain WHERE, no LIKE).
 *   2. Batch-load the item shells via getAsync(array), then explicitly load
 *      their "itemData" so getField("extra") works. getAsync alone returns
 *      data-less shells in Zotero 9 — reading Extra throws UnloadedDataException.
 *   3. Filter for regular, non-deleted items and call getLinks().
 */
export async function rebuildIndex(): Promise<void> {
  index().clear();
  bySource().clear();
  let total = 0;
  const libs = Zotero.Libraries.getAll();
  ztoolkit.log(`QRef: rebuildIndex start — ${libs.length} lib(s)`);
  for (const lib of libs) {
    try {
      // Only regular items can carry an Extra field worth parsing; skip
      // attachments/notes/annotations up front so loadDataTypes stays cheap.
      const ids = (await Zotero.DB.columnQueryAsync(
        `SELECT itemID FROM items JOIN itemTypes USING (itemTypeID)
         WHERE libraryID=? AND typeName NOT IN ('attachment','note','annotation')`,
        [lib.libraryID],
      )) as number[] | false;

      if (!ids || ids.length === 0) {
        ztoolkit.log(`QRef: lib ${lib.libraryID} — 0 rows`);
        continue;
      }
      ztoolkit.log(`QRef: lib ${lib.libraryID} — ${ids.length} row(s)`);

      const items = await zItems().getAsync(ids.map(Number));

      // getAsync returns data-less shells; load the Extra field (itemData)
      // before reading it, or getField("extra") throws UnloadedDataException.
      await zItems().loadDataTypes(items, ["itemData"]);

      for (const item of items) {
        if (!item) continue;
        // The item may have been erased while the awaits above were pending.
        // Its delete event has then already run (and found nothing to remove),
        // so indexing the stale shell here would resurrect a ghost entry.
        // Erased items are unloaded from the registry; check that first.
        if (!Zotero.Items.get(item.id)) continue;
        if (!item.isRegularItem() || item.deleted) continue;
        const links = getLinks(item);
        if (links.length > 0) {
          addSourceToIndex(item);
          total++;
        }
      }
    } catch (e) {
      ztoolkit.log(`QRef: rebuildIndex failed for lib ${lib.libraryID}`, e);
    }
  }
  ztoolkit.log(`QRef: rebuildIndex complete — ${total} source item(s) indexed`);
}

/**
 * Keep the index in sync with a single item change.
 * @param removed true for delete events (item no longer available).
 */
export function onItemChanged(id: number, removed: boolean): void {
  removeSourceFromIndex(id);
  if (removed) return;
  const item = Zotero.Items.get(id);
  if (item && item.isRegularItem() && !item.deleted) addSourceToIndex(item);
}
