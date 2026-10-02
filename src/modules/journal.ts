import {
  addEntry,
  JOURNAL_DEPTH,
  pruneItems,
  sanitizeJournal,
  type JournalEntry,
} from "./journalLogic";
import { log } from "../utils/log";

/**
 * Local change journal (S4): the last states of every item's Reference-Graph
 * line, kept in a file in the Zotero profile on this device. It is not synced,
 * so it still holds what a sync conflict or another tool overwrote.
 *
 * This module only holds state; history.ts feeds it from the notifier and
 * restores from it. storage.ts reports its own writes here (S5), so this
 * module must not import storage.ts.
 */

const JOURNAL_FORMAT = "qualified-references-journal";
const SAVE_DELAY_MS = 2000;

/** Earlier states per item, keyed by "<library ref>/<item key>". */
let entries: Record<string, JournalEntry[]> = {};
/** The line last seen per item id; missing means unknown (taken as none). */
const lastSeen = new Map<number, string | null>();
/** Lines the plugin is about to write, per item id. */
const ownWrites = new Map<number, string | null>();
/** Items whose line the plugin added with an undoable save. */
const undoableCreates = new Set<number>();
/** Items whose references another tool removed this session (S5). */
const removed = new Set<number>();

let loaded = false;
let saveTimer: Promise<void> | null = null;

function journalPath(): string {
  return PathUtils.join(
    Zotero.getProfileDirectory().path,
    "qualified-references-journal.json",
  );
}

/** Read the journal file; entries recorded before this keep precedence. */
export async function loadJournal(): Promise<void> {
  try {
    const path = journalPath();
    if (await IOUtils.exists(path)) {
      const stored = sanitizeJournal(JSON.parse(await IOUtils.readUTF8(path)));
      for (const [key, list] of Object.entries(stored)) {
        entries[key] = [...(entries[key] ?? []), ...list].slice(
          0,
          JOURNAL_DEPTH,
        );
      }
    }
  } catch (e) {
    log("QRef: reading the change journal failed", e);
  }
  loaded = true;
}

/** Write the journal now. */
export async function saveJournal(): Promise<void> {
  if (!loaded) return;
  try {
    entries = pruneItems(entries);
    await IOUtils.writeUTF8(
      journalPath(),
      JSON.stringify({ format: JOURNAL_FORMAT, version: 1, items: entries }),
      { tmpPath: journalPath() + ".tmp" },
    );
  } catch (e) {
    log("QRef: writing the change journal failed", e);
  }
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = Zotero.Promise.delay(SAVE_DELAY_MS).then(() => {
    saveTimer = null;
    return saveJournal();
  });
}

/** Record an earlier state of an item's line. */
export function addJournalEntry(itemRef: string, entry: JournalEntry): void {
  entries[itemRef] = addEntry(entries[itemRef] ?? [], entry);
  scheduleSave();
}

/** Earlier states of an item, newest first. */
export function journalEntries(itemRef: string): JournalEntry[] {
  return entries[itemRef] ?? [];
}

/** Set the line seen for an item at startup, unless a change came first. */
export function rememberLine(id: number, line: string | null): void {
  if (!lastSeen.has(id)) lastSeen.set(id, line);
}

/** Store the line now seen for an item and return the one seen before. */
export function swapLine(id: number, line: string | null): string | null {
  const prev = lastSeen.get(id) ?? null;
  lastSeen.set(id, line);
  return prev;
}

/** Called by setLinks before it saves `line` (null: line removed). */
export function expectOwnWrite(
  id: number,
  line: string | null,
  undoableCreate: boolean,
): void {
  ownWrites.set(id, line);
  if (undoableCreate) undoableCreates.add(id);
}

/** True when `line` is what the plugin itself just wrote to the item. */
export function consumeOwnWrite(id: number, line: string | null): boolean {
  if (!ownWrites.has(id)) return false;
  const own = ownWrites.get(id) === line;
  ownWrites.delete(id);
  return own;
}

/** Whether a removal may be Edit > Undo of the plugin adding the line. */
export function consumeUndoableCreate(id: number): boolean {
  return undoableCreates.delete(id);
}

export function markRemoved(id: number, value: boolean): void {
  if (value) removed.add(id);
  else removed.delete(id);
}

export function isMarkedRemoved(id: number): boolean {
  return removed.has(id);
}
