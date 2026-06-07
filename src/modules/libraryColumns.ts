import { getString } from "../utils/locale";
import { getIncoming } from "./storage";

/**
 * Registers two sortable columns in Zotero's library view:
 *   qref-pos  — count of incoming links with stance ≥ 1  (supporting)
 *   qref-neg  — count of incoming links with stance ≤ −1 (contrasting)
 *
 * Data comes from the in-memory reverse index (no DB hit per row).
 * Columns are opt-in: the user must enable them via right-click on the column header.
 */
export async function registerLibraryColumns(): Promise<void> {
  await Zotero.ItemTreeManager.registerColumns({
    pluginID: addon.data.config.addonID,
    dataKey: "qref-pos",
    label: getString("column-pos-label"),
    dataProvider: (item: Zotero.Item, _dataKey: string) => {
      const count = getIncoming(item).filter((l) => l.link.stance >= 1).length;
      return count > 0 ? String(count) : "";
    },
  });
  await Zotero.ItemTreeManager.registerColumns({
    pluginID: addon.data.config.addonID,
    dataKey: "qref-neg",
    label: getString("column-neg-label"),
    dataProvider: (item: Zotero.Item, _dataKey: string) => {
      const count = getIncoming(item).filter((l) => l.link.stance <= -1).length;
      return count > 0 ? String(count) : "";
    },
  });
}
