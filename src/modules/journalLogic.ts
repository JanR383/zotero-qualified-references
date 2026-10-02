/**
 * Pure parts of the change journal (S4) and of detecting removals by other
 * tools (S5); the state and file handling live in journal.ts.
 */

/** One earlier state of an item's Reference-Graph line. */
export interface JournalEntry {
  /** When this state was replaced (ISO date). */
  time: string;
  /** The JSON part of the Reference-Graph line, as it was stored. */
  line: string;
  /** Number of valid references in `line`. */
  count: number;
}

/** Earlier states kept per item. */
export const JOURNAL_DEPTH = 10;
/** Items kept in the journal; the ones changed longest ago are dropped. */
export const JOURNAL_MAX_ITEMS = 2000;

/**
 * Prepend `entry` to an item's states (newest first), skipping it when it
 * repeats the newest one, and keep at most `depth`.
 */
export function addEntry(
  list: JournalEntry[],
  entry: JournalEntry,
  depth = JOURNAL_DEPTH,
): JournalEntry[] {
  if (list[0]?.line === entry.line) return list;
  return [entry, ...list].slice(0, depth);
}

/** Keep the `max` items whose newest state is the most recent. */
export function pruneItems(
  items: Record<string, JournalEntry[]>,
  max = JOURNAL_MAX_ITEMS,
): Record<string, JournalEntry[]> {
  const keys = Object.keys(items);
  if (keys.length <= max) return items;
  const newest = (k: string) => items[k][0]?.time ?? "";
  keys.sort((a, b) => (newest(a) < newest(b) ? 1 : -1));
  const kept: Record<string, JournalEntry[]> = {};
  for (const k of keys.slice(0, max)) kept[k] = items[k];
  return kept;
}

/** Validate journal data read from disk; drops anything malformed. */
export function sanitizeJournal(raw: unknown): Record<string, JournalEntry[]> {
  const out: Record<string, JournalEntry[]> = {};
  const items = (raw as { items?: unknown } | null)?.items;
  if (typeof items !== "object" || items === null) return out;
  for (const [key, list] of Object.entries(items)) {
    if (!Array.isArray(list)) continue;
    const entries = list
      .filter(
        (e): e is JournalEntry =>
          typeof e === "object" &&
          e !== null &&
          typeof e.time === "string" &&
          typeof e.line === "string" &&
          typeof e.count === "number",
      )
      .map((e) => ({ time: e.time, line: e.line, count: e.count }))
      .slice(0, JOURNAL_DEPTH);
    if (entries.length) out[key] = entries;
  }
  return out;
}

/** The line the plugin keeps after its last reference was deleted. */
export const EMPTY_LINE = "[]";

export interface LineChange {
  /** The line before and after the change; null when there was none. */
  prev: string | null;
  next: string | null;
  /** Valid references before and after. */
  prevCount: number;
  nextCount: number;
  /** The plugin on this device wrote `next`. */
  own: boolean;
  /**
   * The plugin added the line with an undoable save in this session, so its
   * disappearance may be Edit > Undo.
   */
  undoableCreate: boolean;
}

/**
 * True when references were removed by something other than the plugin: they
 * existed before and the line is now gone or unreadable. The plugin itself,
 * on any device, leaves EMPTY_LINE when the last reference is deleted.
 */
export function removedExternally(c: LineChange): boolean {
  if (c.own || c.prev === c.next) return false;
  if (c.prevCount === 0 || c.nextCount > 0) return false;
  if (c.next !== null && c.next.trim() === EMPTY_LINE) return false;
  if (c.next === null && c.undoableCreate) return false;
  return true;
}
