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

// --- Library references -------------------------------------------------------
// A libraryID is a local database ID: groups are numbered in the order they
// were joined on each device, so a raw targetLib written on one device can name
// another (or no) library on the next. Links therefore also carry a stable
// targetLibRef ("u" = personal library, "g<groupID>" = group).

const LIB_REF_RE = /^(u|g\d+)$/;

/** Stable reference for a local libraryID; undefined for feeds/unknown ids. */
export function libraryRef(libraryID: number): string | undefined {
  if (libraryID === Zotero.Libraries.userLibraryID) return "u";
  const lib = Zotero.Libraries.get(libraryID);
  if (!lib || lib.libraryType !== "group") return undefined;
  try {
    return `g${Zotero.Groups.getGroupIDFromLibraryID(libraryID)}`;
  } catch {
    return undefined;
  }
}

/** Local libraryID for a stable reference; undefined if not on this device. */
export function libraryIDFromRef(ref: string): number | undefined {
  if (ref === "u") return Zotero.Libraries.userLibraryID;
  const m = ref.match(/^g(\d+)$/);
  if (!m) return undefined;
  const id = Zotero.Groups.getLibraryIDFromGroupID(Number(m[1]));
  return id === false ? undefined : id;
}

/**
 * The local libraryID a link's target lives in. The stable ref wins when this
 * device has that library. Otherwise (legacy links without a ref, or a ref to a
 * group this device has not joined) the target key is looked up in the stored
 * libraryID, the source's library and then every library — item keys are
 * random, so a hit identifies the library. Falls back to the stored ID.
 */
function resolveTargetLib(link: ReferenceLink, sourceLib: number): number {
  const fromRef = link.targetLibRef
    ? libraryIDFromRef(link.targetLibRef)
    : undefined;
  if (fromRef !== undefined) return fromRef;
  const candidates = [
    link.targetLib,
    sourceLib,
    ...Zotero.Libraries.getAll().map((l) => l.libraryID),
  ];
  for (const lib of candidates) {
    if (
      Zotero.Libraries.exists(lib) &&
      Zotero.Items.getByLibraryAndKey(lib, link.targetKey)
    ) {
      return lib;
    }
  }
  return link.targetLib;
}

/** Validate one parsed entry; returns a clean ReferenceLink or null to drop. */
function sanitizeLink(raw: unknown): ReferenceLink | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  // Required identity fields — drop the entry if they are unusable.
  if (typeof o.id !== "string" || o.id.length === 0) return null;
  if (typeof o.targetKey !== "string" || o.targetKey.length === 0) return null;
  const targetLibRef =
    typeof o.targetLibRef === "string" && LIB_REF_RE.test(o.targetLibRef)
      ? o.targetLibRef
      : undefined;
  const hasLib =
    typeof o.targetLib === "number" && Number.isInteger(o.targetLib);
  if (!hasLib && !targetLibRef) return null;
  // Stance: clamp to the known scale, defaulting to neutral.
  const stance: Stance =
    typeof o.stance === "number" && [-2, -1, 0, 1, 2].includes(o.stance)
      ? (o.stance as Stance)
      : 0;
  return {
    id: o.id.slice(0, 100),
    targetKey: o.targetKey.slice(0, 100),
    targetLib: hasLib ? (o.targetLib as number) : 0,
    targetLibRef,
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
      const links = parsed
        .map(sanitizeLink)
        .filter((l): l is ReferenceLink => l !== null);
      for (const link of links) {
        link.targetLib = resolveTargetLib(link, item.libraryID);
      }
      return links;
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
 * Stored shape of a link, with a fixed key order (the order sanitizeLink reads
 * them in). The JSON must not depend on how the in-memory object was built:
 * re-saving unchanged links has to reproduce the same line, or every save
 * would register as a change and be uploaded by sync.
 *
 * targetLibRef is refreshed from the resolved local ID; when this device cannot
 * name the library (a group it has not joined), the ref it was read with is
 * kept so the link survives the round trip.
 */
function serializeLink(l: ReferenceLink): ReferenceLink {
  return {
    id: l.id,
    targetKey: l.targetKey,
    targetLib: l.targetLib,
    targetLibRef: libraryRef(l.targetLib) ?? l.targetLibRef,
    stance: l.stance,
    sourcePages: l.sourcePages,
    targetPages: l.targetPages,
    sourceAttachmentKey: l.sourceAttachmentKey,
    sourceAnnotationKey: l.sourceAnnotationKey,
    comment: l.comment,
    added: l.added,
    modified: l.modified,
  };
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
    kept.push(`${EXTRA_KEY}: ${JSON.stringify(links.map(serializeLink))}`);
  }
  // Drop leading/trailing empties left behind by removing our line.
  item.setField("extra", kept.join("\n").replace(/^\n+|\n+$/g, ""));
  await item.saveTx();
}

/**
 * Read-modify-write on the item's CURRENT links. UI handlers must go through
 * this instead of saving an array captured at render time: Extra may have
 * changed since (sync, the reader hook, a second pane), and writing the stale
 * array back would silently drop those changes.
 */
export async function updateLinks(
  item: Zotero.Item,
  mutate: (links: ReferenceLink[]) => void,
): Promise<void> {
  const links = getLinks(item);
  mutate(links);
  await setLinks(item, links);
}

/** Patch one link by id (no-op if it no longer exists) and stamp `modified`. */
export async function updateLink(
  item: Zotero.Item,
  id: string,
  patch: Partial<Omit<ReferenceLink, "id">>,
): Promise<void> {
  await updateLinks(item, (links) => {
    const link = links.find((l) => l.id === id);
    if (!link) return;
    Object.assign(link, patch, { modified: new Date().toISOString() });
  });
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
