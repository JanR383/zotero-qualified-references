/**
 * Small navigation/window helpers shared by the item pane and the standalone
 * graph/list views, so the same Zotero casts and selection logic are not
 * repeated per view.
 */

/** Select an item in the active Zotero pane (used by every "jump to" link). */
export function selectItemInPane(id: number): void {
  Zotero.getActiveZoteroPane()?.selectItem(id);
}

/**
 * Open one of our standalone windows, handing over the arg object via the
 * dialog's `window.arguments[0]` (process-local, so plain objects/functions
 * cross the boundary directly). `openDialog` is untyped on the Zotero window.
 */
export function openViewWindow(
  win: Window,
  url: string,
  name: string,
  features: string,
  arg: unknown,
): void {
  (win as unknown as { openDialog: (...a: unknown[]) => void }).openDialog(
    url,
    name,
    features,
    arg,
  );
}
