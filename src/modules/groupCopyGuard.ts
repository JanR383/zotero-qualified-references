import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { zItems } from "../utils/zoteroApis";
import { getLinks, setLinks } from "./storage";

/**
 * Privacy guard for copying items into group libraries (scenario a).
 *
 * When an item carrying qualified references is copied from a personal library
 * into a group, Zotero clones the whole Extra field — including the
 * Reference-Graph line, exposing private comments/stance to all group members.
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
 * True if this freshly added group item looks like a personal→group copy:
 * it carries references AND at least one target resolves to an item in a local
 * *personal* (user) library. The resolve check is what distinguishes my own
 * copy from another member's leaked item synced in (whose target keys don't
 * exist in my libraries) and from legitimate in-group references (whose targets
 * live in the group itself).
 */
function isPersonalCopyIntoGroup(item: Zotero.Item): boolean {
  if (!Zotero.Libraries.isGroupLibrary(item.libraryID)) return false;
  for (const link of getLinks(item)) {
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
    if (!isPersonalCopyIntoGroup(item)) return;

    const keep =
      Zotero.Prefs.get(`${config.prefsPrefix}.copyRefsToGroup`, true) === true;
    if (keep) return;

    await setLinks(item, []);
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: getString("reader-groupcopy-stripped"),
        type: "default",
      })
      .show();
  } catch (e) {
    ztoolkit.log("QRef: group-copy guard failed", e);
  }
}
