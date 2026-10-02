import {
  addJournalEntry,
  consumeOwnWrite,
  consumeUndoableCreate,
  isMarkedRemoved,
  journalEntries,
  markRemoved,
  rememberLine,
  swapLine,
} from "./journal";
import { removedExternally, type JournalEntry } from "./journalLogic";
import {
  libraryRef,
  linksInLine,
  referenceLine,
  setLinks,
  sourceItemIDs,
} from "./storage";

/**
 * Feeds the change journal (S4) from item changes and detects references
 * removed by another tool (S5). Called by the notifier for every modified
 * item; storage.ts reports the plugin's own writes to the journal.
 */

/** Journal key of an item; undefined for feeds and unknown libraries. */
function itemRef(item: Zotero.Item): string | undefined {
  const lib = libraryRef(item.libraryID);
  return lib ? `${lib}/${item.key}` : undefined;
}

/**
 * Remember the current line of every item with references, once the index
 * is built, so the first change of each item can be journaled.
 */
export function seedJournal(): void {
  for (const id of sourceItemIDs()) {
    const item = Zotero.Items.get(id);
    if (item) rememberLine(id, referenceLine(item));
  }
}

/**
 * Journal the previous line of a changed item. Returns true when another
 * tool removed its references (S5); the item is then marked until its
 * references come back or the user dismisses the notice.
 */
export function trackLineChange(id: number): boolean {
  const item = Zotero.Items.get(id);
  if (!item || !item.isRegularItem()) return false;
  const ref = itemRef(item);
  if (!ref) return false;
  const next = referenceLine(item);
  const own = consumeOwnWrite(id, next);
  const prev = swapLine(id, next);
  if (prev === next) return false;

  const prevCount = linksInLine(prev, item.libraryID).length;
  const nextCount = linksInLine(next, item.libraryID).length;
  if (prev !== null) {
    addJournalEntry(ref, {
      time: new Date().toISOString(),
      line: prev,
      count: prevCount,
    });
  }
  const removed = removedExternally({
    prev,
    next,
    prevCount,
    nextCount,
    own,
    undoableCreate: next === null && consumeUndoableCreate(id),
  });
  if (removed) markRemoved(id, true);
  else if (nextCount > 0) markRemoved(id, false);
  return removed;
}

/** Earlier states of the item's references, newest first. */
export function itemHistory(item: Zotero.Item): JournalEntry[] {
  const ref = itemRef(item);
  return ref ? journalEntries(ref) : [];
}

/** Whether another tool removed the item's references this session. */
export function wasRemovedExternally(item: Zotero.Item): boolean {
  return isMarkedRemoved(item.id);
}

export function dismissRemoval(item: Zotero.Item): void {
  markRemoved(item.id, false);
}

/**
 * Replace the item's references with an earlier state. The state replaced is
 * journaled in turn, and Zotero 10 offers the restore in Edit > Undo.
 */
export async function restoreEntry(
  item: Zotero.Item,
  entry: JournalEntry,
): Promise<void> {
  const links = linksInLine(entry.line, item.libraryID);
  await setLinks(item, links, { action: "restore", count: links.length });
  markRemoved(item.id, false);
}
