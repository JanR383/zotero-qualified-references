import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import {
  registerReferenceSection,
  unregisterReferenceSection,
} from "./modules/referenceSection";
import { initIndexAndNotifier, unregisterNotifier } from "./modules/notifier";
import { registerLibraryColumns } from "./modules/libraryColumns";
import { openGraphView } from "./modules/graphView";

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
  try {
    await initIndexAndNotifier();
  } catch (e) {
    ztoolkit.log(
      "QRef: index build failed, continuing without reverse index",
      e,
    );
  }
  registerReferenceSection();
  try {
    await registerLibraryColumns();
  } catch (e) {
    ztoolkit.log(
      "QRef: column registration failed, continuing without columns",
      e,
    );
  }

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();
  // Inject our FTL file into the window's Fluent bundle.
  // ItemPaneManager renders section headers with data-l10n-id, which is resolved
  // by the document's own Fluent bundle — not by our standalone Localization
  // instance. Without this injection the l10nID resolves to nothing and only
  // the icon is shown.
  injectLocaleIntoWindow(win as unknown as Window);
  injectStylesIntoWindow(win as unknown as Window);
  // Tools menu entry to open the reference graph (M5). Registered via ztoolkit
  // so it is auto-removed by ztoolkit.unregisterAll() on unload/shutdown.
  addon.data.ztoolkit.Menu.register("menuTools", {
    tag: "menuitem",
    id: `${addon.data.config.addonRef}-menu-graph`,
    label: getString("menu-graph"),
    commandListener: () => openGraphView(win as unknown as Window),
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
  (win as any).MozXULElement.insertFTLIfNeeded(href);
  ztoolkit.log(`QRef: locale registered → ${href}`);
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  unregisterReferenceSection();
  unregisterNotifier();
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
