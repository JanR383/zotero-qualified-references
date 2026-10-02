import { version } from "../../package.json";
import { getString } from "../utils/locale";
import { log, showNotice } from "../utils/log";
import { pickOpenPath, pickSavePath } from "../utils/filePicker";
import { mergeLinks } from "./backupMerge";
import {
  ExtraTooLargeError,
  getLinks,
  libraryIDFromRef,
  libraryRef,
  parseStoredLinks,
  serializeLink,
  setLinks,
  sourceItemIDs,
} from "./storage";
import type { ReferenceLink } from "./types";

/**
 * Backup and restore of all references (S2). The backup holds every stored
 * field of every reference, unfiltered, with items identified by library and
 * key, so it can restore what a sync conflict, another tool rewriting Extra or
 * an accidental deletion removed. The Export menus of the graph and list
 * windows are for analysis instead and leave fields out.
 */

export const BACKUP_FORMAT = "qualified-references-backup";
const BACKUP_VERSION = 1;

interface BackupItem {
  library: string; // "u" or "g<groupID>", as in targetLibRef
  key: string;
  title: string; // for people reading the file; ignored on restore
  links: ReferenceLink[];
}

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  plugin: string;
  created: string;
  items: BackupItem[];
}

export function buildBackup(): BackupFile {
  const items: BackupItem[] = [];
  for (const id of sourceItemIDs()) {
    const item = Zotero.Items.get(id);
    if (!item) continue;
    const library = libraryRef(item.libraryID);
    const links = getLinks(item);
    if (!library || links.length === 0) continue;
    items.push({
      library,
      key: item.key,
      title: item.getDisplayTitle(),
      links: links.map(serializeLink),
    });
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    plugin: version,
    created: new Date().toISOString(),
    items,
  };
}

function backupFileName(): string {
  return `qualified-references-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/** Tools → Back up references…: write every reference to a JSON file. */
export async function backUpReferences(win: Window): Promise<void> {
  try {
    const path = await pickSavePath(
      win,
      getString("backup-title"),
      backupFileName(),
    );
    if (!path) return;
    const backup = buildBackup();
    await IOUtils.writeUTF8(path, JSON.stringify(backup, null, 1));
    const count = backup.items.reduce((n, i) => n + i.links.length, 0);
    showNotice(getString("backup-done", { args: { count } }));
  } catch (e) {
    log("QRef: backup failed", e);
    showNotice(getString("backup-failed"));
  }
}

export interface RestoreResult {
  added: number;
  updated: number;
  items: number; // items changed
  notFound: number; // items not in this Zotero (deleted, group not joined)
  readOnly: number; // items in libraries this user cannot edit
  tooLarge: number; // items whose Extra would exceed the sync limit
}

/** Parse and check a backup file's top level; null if it is not one. */
export function parseBackup(text: string): BackupItem[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const o = data as Partial<BackupFile> | null;
  if (!o || o.format !== BACKUP_FORMAT || !Array.isArray(o.items)) return null;
  if (typeof o.version !== "number" || o.version > BACKUP_VERSION) return null;
  return o.items.filter(
    (i): i is BackupItem =>
      !!i &&
      typeof i.library === "string" &&
      typeof i.key === "string" &&
      Array.isArray(i.links),
  );
}

/**
 * Merge the backup into the current references (see mergeLinks): missing
 * references come back, newer edits win, nothing is deleted. The backup is
 * untrusted input and goes through the same validation as Extra.
 */
export async function restoreItems(
  items: BackupItem[],
): Promise<RestoreResult> {
  const result: RestoreResult = {
    added: 0,
    updated: 0,
    items: 0,
    notFound: 0,
    readOnly: 0,
    tooLarge: 0,
  };
  for (const entry of items) {
    const libraryID = libraryIDFromRef(entry.library);
    const item =
      libraryID === undefined
        ? false
        : Zotero.Items.getByLibraryAndKey(libraryID, entry.key);
    if (!item || !item.isRegularItem()) {
      result.notFound++;
      continue;
    }
    if (!Zotero.Libraries.isEditable(item.libraryID)) {
      result.readOnly++;
      continue;
    }
    const backup = parseStoredLinks(entry.links, item.libraryID);
    const merged = mergeLinks(getLinks(item), backup);
    if (merged.added + merged.updated === 0) continue;
    try {
      await setLinks(item, merged.links);
    } catch (e) {
      if (e instanceof ExtraTooLargeError) {
        result.tooLarge++;
        continue;
      }
      throw e;
    }
    result.added += merged.added;
    result.updated += merged.updated;
    result.items++;
  }
  return result;
}

/** Tools → Restore references…: merge a backup file into the libraries. */
export async function restoreReferences(win: Window): Promise<void> {
  try {
    const path = await pickOpenPath(
      win,
      getString("restore-title"),
      backupFileName(),
    );
    if (!path) return;
    const items = parseBackup(await IOUtils.readUTF8(path));
    if (!items) {
      showNotice(getString("restore-invalid"), 10_000);
      return;
    }
    const r = await restoreItems(items);
    const skipped = r.notFound + r.readOnly + r.tooLarge;
    showNotice(
      getString("restore-done", {
        args: { added: r.added, updated: r.updated, items: r.items },
      }) +
        (skipped > 0
          ? " " +
            getString("restore-skipped", {
              args: {
                notFound: r.notFound,
                readOnly: r.readOnly,
                tooLarge: r.tooLarge,
              },
            })
          : ""),
      skipped > 0 ? 15_000 : 8_000,
    );
  } catch (e) {
    log("QRef: restore failed", e);
    showNotice(getString("restore-failed"), 10_000);
  }
}
