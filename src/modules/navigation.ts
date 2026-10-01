import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { log } from "../utils/log";
import { zReader } from "../utils/zoteroApis";
import {
  VIEW_CHANGED_EVENT,
  type ViewArgBase,
  type ViewStringsBase,
} from "../shared/viewArg";
import { buildScopeOptions, makePredicate } from "./scope";
import { STANCE_LABEL_KEY, STANCE_ORDER } from "./stanceMeta";
import { getCurrentPaletteId, paletteOverrideCss } from "./stancePalette";
import type { Stance } from "./types";

/**
 * Small navigation/window helpers shared by the item pane and the standalone
 * graph/list views, so the same Zotero casts and selection logic are not
 * repeated per view.
 */

/** Select an item in the active Zotero pane (used by every "jump to" link). */
export function selectItemInPane(id: number): void {
  Zotero.getActiveZoteroPane()?.selectItem(id);
}

/** Open the source PDF at an anchored annotation (M6). */
export function openAnnotation(
  lib: number,
  attKey: string,
  annKey: string,
): void {
  const att = Zotero.Items.getByLibraryAndKey(lib, attKey);
  if (!att) return;
  try {
    void zReader().open(att.id, { annotationID: annKey });
  } catch (e) {
    log("QRef: failed to open annotation", e);
  }
}

/** Item filter a view's data is built with; undefined means every item. */
export type ItemFilter = ((item: Zotero.Item) => boolean) | undefined;

/**
 * The window arg fields both views share; `build` makes the data for a filter.
 * The filter of the last chosen scope is kept, so a live refresh (G6/L8)
 * rebuilds the same scope; for "current selection" that is the snapshot taken
 * when it was chosen, not whatever is selected in Zotero now.
 */
export function viewArgBase(
  build: (filter: ItemFilter) => unknown,
): ViewArgBase {
  let filter: ItemFilter;
  return {
    selectItem: selectItemInPane,
    paletteCss: paletteOverrideCss(getCurrentPaletteId()),
    scopes: buildScopeOptions(),
    getScopedData: (id: string) => {
      filter = makePredicate(id);
      return JSON.stringify(build(filter));
    },
    getCurrentData: () => JSON.stringify(build(filter)),
  };
}

/** The strings both views share. */
export function viewStringsBase(
  title: Parameters<typeof getString>[0],
): ViewStringsBase {
  const stances = {} as Record<Stance, string>;
  for (const s of STANCE_ORDER) stances[s] = getString(STANCE_LABEL_KEY[s]);
  return {
    title: getString(title),
    empty: getString("graph-empty"),
    scope: getString("scope-label"),
    stances,
  };
}

/** The open graph and list windows, told when references change (G6/L8). */
const openViews = new Set<Window>();

/**
 * Tell every open view window that items changed. Each window debounces the
 * event and pulls fresh data itself via `getCurrentData`. Closed windows are
 * dropped here rather than on unload, which also fires for the initial
 * about:blank document of a new dialog.
 */
export function notifyViews(): void {
  for (const w of openViews) {
    if (w.closed) {
      openViews.delete(w);
      continue;
    }
    try {
      w.dispatchEvent(new w.Event(VIEW_CHANGED_EVENT));
    } catch (e) {
      log("QRef: notifying a view window failed", e);
    }
  }
}

/**
 * Open content/<page>.xhtml as a standalone window, handing over `arg` via the
 * dialog's `window.arguments[0]` (process-local, so plain objects/functions
 * cross the boundary directly). `openDialog` is untyped on the Zotero window.
 */
export function openViewWindow(
  win: Window,
  page: "graph" | "list",
  size: { width: number; height: number },
  arg: ViewArgBase,
): void {
  const view = (
    win as unknown as { openDialog: (...a: unknown[]) => Window | null }
  ).openDialog(
    `chrome://${config.addonRef}/content/${page}.xhtml`,
    `${config.addonRef}-${page}`,
    `chrome,resizable,centerscreen,width=${size.width},height=${size.height}`,
    arg,
  );
  if (view) openViews.add(view);
}
