/**
 * Thin wrapper around Zotero's native item-selection dialog — the same
 * database-backed picker used by the built-in "Related" box. Returns the
 * selected item ids (empty if cancelled).
 */
export function pickItems(win: Window): number[] {
  const io: {
    dataIn: null;
    dataOut: number[] | null;
    singleSelection: boolean;
  } = { dataIn: null, dataOut: null, singleSelection: false };
  win.openDialog(
    "chrome://zotero/content/selectItemsDialog.xhtml",
    "",
    "chrome,dialog=no,resizable=yes,centerscreen,modal",
    io,
  );
  return Array.isArray(io.dataOut) ? io.dataOut : [];
}

/**
 * The picked ids that can be reference targets, in pick order and without
 * duplicates. The dialog also offers notes and attachments; a child of a
 * regular item stands for that item, standalone notes/attachments are dropped.
 * Items in the trash and the source itself are skipped.
 */
export function referenceTargets(source: Zotero.Item, ids: number[]): number[] {
  const out: number[] = [];
  for (const id of ids) {
    let item = Zotero.Items.get(id);
    if (item && !item.isRegularItem() && item.parentItemID) {
      item = Zotero.Items.get(item.parentItemID);
    }
    if (!item || !item.isRegularItem() || item.deleted) continue;
    if (item.id === source.id || out.includes(item.id)) continue;
    out.push(item.id);
  }
  return out;
}
