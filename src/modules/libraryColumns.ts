import { getString } from "../utils/locale";
import { zItemsView } from "../utils/zoteroApis";
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
  await itemListsLoaded();
  const count = (item: Zotero.Item, match: (stance: number) => boolean) => {
    const n = getIncoming(item).filter((l) => match(l.link.stance)).length;
    return n > 0 ? String(n) : "";
  };
  await registerColumn({
    pluginID: addon.data.config.addonID,
    dataKey: "qref-pos",
    label: getString("column-pos-label"),
    dataProvider: (item: Zotero.Item) => count(item, (s) => s >= 1),
  });
  await registerColumn({
    pluginID: addon.data.config.addonID,
    dataKey: "qref-neg",
    label: getString("column-neg-label"),
    dataProvider: (item: Zotero.Item) => count(item, (s) => s <= -1),
  });
}

/**
 * Registering a column makes every item list reset its columns. A list that
 * has not been rendered yet fails there ("_resetColumns … this.tree is
 * undefined" in Zotero's itemTree, which lacks a null check), so wait until
 * the main windows' item lists have loaded, at most 10 s.
 */
async function itemListsLoaded(): Promise<void> {
  const loads = Zotero.getMainWindows().map((win) =>
    zItemsView(win)?.waitForLoad?.(),
  );
  await Promise.race([Promise.all(loads), Zotero.Promise.delay(10_000)]);
}

type ColumnOptions = Parameters<
  typeof Zotero.ItemTreeManager.registerColumn
>[0];

/**
 * registerColumn (synchronous) replaces the deprecated registerColumns in
 * Zotero 10; Zotero 9 may only have the latter.
 */
async function registerColumn(options: ColumnOptions): Promise<void> {
  const manager = Zotero.ItemTreeManager;
  if (typeof manager.registerColumn === "function") {
    manager.registerColumn(options);
  } else {
    await manager.registerColumns(options);
  }
}
