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
import { getLinks } from "./storage";
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

/** Open the PDF anchor of one reference, looked up fresh on its source. */
function openAnchor(sourceId: number, linkId: string): void {
  const source = Zotero.Items.get(sourceId);
  if (!source) return;
  const link = getLinks(source).find((l) => l.id === linkId);
  if (!link?.sourceAttachmentKey || !link.sourceAnnotationKey) return;
  openAnnotation(
    source.libraryID,
    link.sourceAttachmentKey,
    link.sourceAnnotationKey,
  );
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
    openAnchor,
    paletteCss: paletteOverrideCss(getCurrentPaletteId()),
    scopes: buildScopeOptions(),
    getScopedData: (id: string) => {
      filter = makePredicate(id);
      return JSON.stringify(build(filter));
    },
    getCurrentData: () => JSON.stringify(build(filter)),
    saveExport: (win, fileName, data, base64) => {
      void saveExport(win, fileName, data, base64).catch((e: unknown) =>
        log("QRef: export failed", e),
      );
    },
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
    export: getString("export"),
    exportTitle: getString("export-title"),
    exportCsv: getString("export-csv"),
    sourcePages: getString("field-source-pages"),
    targetPages: getString("field-target-pages"),
  };
}

/** A zotero://select link to an item, for exports (G8/L7). */
export function itemUri(item: Zotero.Item): string {
  const lib = Zotero.Libraries.get(item.libraryID);
  const path =
    lib && lib.libraryType === "group"
      ? `groups/${(lib as Zotero.Group).groupID}`
      : "library";
  return `zotero://select/${path}/items/${item.key}`;
}

interface FilePickerInstance {
  init(win: Window, title: string, mode: number): void;
  appendFilter(title: string, filter: string): void;
  defaultString: string;
  show(): Promise<number>;
  file: string;
  modeSave: number;
  returnOK: number;
  returnReplace: number;
}

/** Zotero's async file picker (chrome/content/zotero/modules/filePicker.mjs). */
function filePicker(): FilePickerInstance {
  const { FilePicker } = ChromeUtils.importESModule(
    "chrome://zotero/content/modules/filePicker.mjs",
  ) as { FilePicker: new () => FilePickerInstance };
  return new FilePicker();
}

function base64ToBytes(win: Window, b64: string): Uint8Array {
  const bin = win.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function saveExport(
  win: Window,
  fileName: string,
  data: string,
  base64 = false,
): Promise<void> {
  const fp = filePicker();
  fp.init(win, getString("export-title"), fp.modeSave);
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1);
  fp.appendFilter(ext.toUpperCase(), `*.${ext}`);
  fp.defaultString = fileName;
  const rv = await fp.show();
  if (rv !== fp.returnOK && rv !== fp.returnReplace) return;
  if (base64) await IOUtils.write(fp.file, base64ToBytes(win, data));
  else await IOUtils.writeUTF8(fp.file, data);
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
