import { config } from "../package.json";
import { getLocaleID, getString, initLocale } from "./utils/locale";
import {
  refreshAllSections,
  registerReferenceSection,
  unregisterReferenceSection,
} from "./modules/referenceSection";
import { initIndexAndNotifier, unregisterNotifier } from "./modules/notifier";
import { registerLibraryColumns } from "./modules/libraryColumns";
import { openGraphView } from "./modules/graphView";
import { openListView } from "./modules/listView";
import { registerReaderHook, unregisterReaderHook } from "./modules/readerHook";
import { zMenuManager } from "./utils/zoteroApis";
import {
  getCurrentPaletteId,
  PALETTE_PREF,
  paletteOverrideCss,
} from "./modules/stancePalette";

let palettePrefObserver: symbol | undefined;
let stancePrefObserver: symbol | undefined;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  // Inject FTL into all currently open windows BEFORE registering the section.
  // Zotero resolves sidenav.l10nID synchronously at registration time; if the
  // FTL is not yet in the bundle the sidenav button is silently omitted.
  for (const win of Zotero.getMainWindows()) {
    injectLocaleIntoWindow(win as unknown as Window);
  }
  // Registers the notifier synchronously and builds the reverse index in the
  // background — startup is not blocked on large databases.
  initIndexAndNotifier().catch((e) =>
    ztoolkit.log(
      "QRef: index build failed, continuing without reverse index",
      e,
    ),
  );
  registerReferenceSection();
  registerReaderHook();
  registerMenus();
  try {
    await registerLibraryColumns();
  } catch (e) {
    ztoolkit.log(
      "QRef: column registration failed, continuing without columns",
      e,
    );
  }

  // Preferences pane (M7). rootURI is a plugin-scope global (set by bootstrap).
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/qref.svg`,
  });
  // Re-apply the stance palette to all main windows when the pref changes.
  palettePrefObserver = Zotero.Prefs.registerObserver(
    PALETTE_PREF,
    () => {
      for (const win of Zotero.getMainWindows()) {
        applyStancePalette(win as unknown as Window);
      }
    },
    true,
  );
  // Re-render visible reference sections when the stance-control style changes,
  // so toggling the compact setting takes effect without reopening the pane.
  stancePrefObserver = Zotero.Prefs.registerObserver(
    `${config.prefsPrefix}.stanceControlCompact`,
    () => refreshAllSections(),
    true,
  );

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Inject our FTL file into the window's Fluent bundle.
  // ItemPaneManager renders section headers with data-l10n-id, which is resolved
  // by the document's own Fluent bundle — not by our standalone Localization
  // instance. Without this injection the l10nID resolves to nothing and only
  // the icon is shown.
  injectLocaleIntoWindow(win as unknown as Window);
  injectStylesIntoWindow(win as unknown as Window);
  applyStancePalette(win as unknown as Window);
}

/**
 * Register the Tools-menu entries (Reference Graph + List) via Zotero's native
 * MenuManager (zotero-plugin-toolkit dropped its Menu manager in v5.1.2). This
 * registers once globally; Zotero injects the items into every main window's
 * Tools menu. Labels come from the FTL `.label` attribute via l10nID.
 */
function registerMenus(): void {
  zMenuManager()?.registerMenu({
    menuID: `${addon.data.config.addonRef}-tools`,
    pluginID: addon.data.config.addonID,
    target: "main/menubar/tools",
    menus: [
      {
        menuType: "menuitem",
        l10nID: getLocaleID("menu-graph"),
        onCommand: () => openGraphView(Zotero.getMainWindow() as Window),
      },
      {
        menuType: "menuitem",
        l10nID: getLocaleID("menu-list"),
        onCommand: () => openListView(Zotero.getMainWindow() as Window),
      },
    ],
  });
}

/**
 * Add our stylesheet (stance colour custom properties) to a window's document.
 * Idempotent. The item pane lives in the main window document, so a document
 * stylesheet applies to the section's badges and buttons.
 */
function injectStylesIntoWindow(win: Window): void {
  const doc = win.document;
  const linkId = `${addon.data.config.addonRef}-style`;
  if (doc.getElementById(linkId)) return;
  const link = doc.createElement("link");
  link.id = linkId;
  link.setAttribute("rel", "stylesheet");
  link.setAttribute(
    "href",
    `chrome://${addon.data.config.addonRef}/content/qref.css`,
  );
  (doc.head ?? doc.documentElement)?.appendChild(link);
  ztoolkit.log("QRef: stylesheet injected");
}

/**
 * Apply the chosen stance palette (M7) by injecting/updating an override
 * <style> after qref.css. Empty CSS (default palette) removes the override.
 */
function applyStancePalette(win: Window): void {
  const doc = win.document;
  const id = `${addon.data.config.addonRef}-palette-override`;
  const css = paletteOverrideCss(getCurrentPaletteId());
  let style = doc.getElementById(id);
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = doc.createElement("style");
    style.id = id;
    (doc.head ?? doc.documentElement)?.appendChild(style);
  }
  style.textContent = css;
}

/**
 * Add our FTL resource to a window's Fluent bundle. Idempotent — safe to call
 * multiple times for the same window.
 *
 * Uses Gecko's MozXULElement.insertFTLIfNeeded (the API Zotero uses internally
 * and documents for plugins in pluginAPI/menuManager.js). Unlike a manual
 * <link rel="localization"> element — which loads the resource asynchronously
 * and races the section's first localization pass, leaving the label blank — it
 * synchronously calls document.l10n.addResourceIds(), so the resource is in the
 * bundle before Zotero resolves the section header's data-l10n-id.
 *
 * The bare resource ID matches what getString() uses in locale.ts
 * (`new Localization(["qref-addon.ftl"])`): Zotero auto-registers the plugin's
 * locale/ folder as an L10n source.
 */
function injectLocaleIntoWindow(win: Window): void {
  const href = `${addon.data.config.addonRef}-addon.ftl`;
  (
    win as Window & {
      MozXULElement: { insertFTLIfNeeded(href: string): void };
    }
  ).MozXULElement.insertFTLIfNeeded(href);
  ztoolkit.log(`QRef: locale registered → ${href}`);
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  // Nothing per-window to tear down: menus/sections/reader hooks are global
  // registrations (cleaned up in onShutdown), and the injected <style>/<link>
  // elements die with the window's document. Deliberately NOT calling
  // ztoolkit.unregisterAll() here — that would wipe global toolkit state when
  // a secondary window closes.
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  unregisterReferenceSection();
  unregisterReaderHook();
  zMenuManager()?.unregisterMenu(`${addon.data.config.addonRef}-tools`);
  unregisterNotifier();
  if (palettePrefObserver !== undefined) {
    Zotero.Prefs.unregisterObserver(palettePrefObserver);
    palettePrefObserver = undefined;
  }
  if (stancePrefObserver !== undefined) {
    Zotero.Prefs.unregisterObserver(stancePrefObserver);
    stancePrefObserver = undefined;
  }
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
