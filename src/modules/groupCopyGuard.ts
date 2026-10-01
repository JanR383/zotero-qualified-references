import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { zItems } from "../utils/zoteroApis";
import { getLinks, setLinks } from "./storage";
import { log, showNotice } from "../utils/log";

/**
 * Privacy guard for copying items into group libraries (scenario a).
 *
 * When an item carrying qualified references is copied from a personal library
 * (or another group) into a group, Zotero clones the whole Extra field —
 * including the Reference-Graph line, exposing private comments/stance to all
 * group members.
 * Zotero itself drops "Related" links on such cross-library copies for the same
 * reason; we mirror that: by default the references are removed from the copy.
 *
 * Controlled by the `copyRefsToGroup` preference (default false = drop).
 *
 * Triggered from the notifier on `add` events only (copies/new items fire
 * `add`; references authored *inside* the group via the picker arrive as
 * `modify` and are intentionally left alone — and `add`-only avoids a
 * setLinks → modify re-trigger loop).
 */

/**
 * True if this freshly added group item looks like a copy from another library
 * whose references must not reach the group.
 *
 * - Created on this device (version 0, never synced): Zotero's cross-library
 *   copy clones Extra, so any reference pointing outside the group came along
 *   with the copy. No existence check here: a copy whose targets were since
 *   erased, or live in another group, still carries private comments.
 * - Synced in (version > 0): only when a target resolves to an item in a local
 *   *personal* library. That distinguishes my own copy made on another device
 *   from another member's leaked item (whose target keys don't exist in my
 *   libraries), which this device must not rewrite.
 */
function isCopyIntoGroup(item: Zotero.Item): boolean {
  if (!Zotero.Libraries.isGroupLibrary(item.libraryID)) return false;
  const links = getLinks(item);
  if (item.version === 0) {
    return links.some((link) => link.targetLib !== item.libraryID);
  }
  for (const link of links) {
    const target = Zotero.Items.getByLibraryAndKey(
      link.targetLib,
      link.targetKey,
    );
    if (!target) continue;
    const lib = Zotero.Libraries.get(link.targetLib);
    if (lib && lib.isGroup === false) return true;
  }
  return false;
}

export async function handlePossibleGroupCopy(id: number): Promise<void> {
  try {
    const item = Zotero.Items.get(id);
    if (!item || !item.isRegularItem() || item.deleted) return;
    if (!Zotero.Libraries.isGroupLibrary(item.libraryID)) return;

    // Extra may not be loaded yet on an `add` event; load before reading.
    await zItems().loadDataTypes([item], ["itemData"]);
    if (!isCopyIntoGroup(item)) return;

    const keep =
      Zotero.Prefs.get(`${config.prefsPrefix}.copyRefsToGroup`, true) === true;
    if (keep) return;

    await setLinks(item, []);
    showNotice(getString("reader-groupcopy-stripped"));
  } catch (e) {
    log("QRef: group-copy guard failed", e);
  }
}
