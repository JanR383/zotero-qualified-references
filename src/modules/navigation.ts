import { config } from "../../package.json";
import { getString } from "../utils/locale";
import type { ViewArgBase, ViewStringsBase } from "../shared/viewArg";
import { buildScopeOptions } from "./scope";
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

/** The window arg fields both views share; `build` makes a scope's data. */
export function viewArgBase(build: (scopeId: string) => unknown): ViewArgBase {
  return {
    selectItem: selectItemInPane,
    paletteCss: paletteOverrideCss(getCurrentPaletteId()),
    scopes: buildScopeOptions(),
    getScopedData: (id: string) => JSON.stringify(build(id)),
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
  (win as unknown as { openDialog: (...a: unknown[]) => void }).openDialog(
    `chrome://${config.addonRef}/content/${page}.xhtml`,
    `${config.addonRef}-${page}`,
    `chrome,resizable,centerscreen,width=${size.width},height=${size.height}`,
    arg,
  );
}
