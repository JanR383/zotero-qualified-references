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
