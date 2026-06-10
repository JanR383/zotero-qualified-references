import { getString } from "../utils/locale";
import { pickItems } from "./picker";
import { getLinks, makeLink, setLinks } from "./storage";
import { zReader, type ReaderEvent } from "../utils/zoteroApis";

/**
 * Reader integration (M6): add a "Create qualified reference from here" entry to
 * the annotation context menu in the PDF reader. Right-click a highlight in item
 * A's PDF and pick a target B → we create a reference A→B with the annotation's
 * page auto-filled into sourcePages and a source anchor stored for jumping back.
 *
 * Uses the documented Zotero 7 reader hook
 *   Zotero.Reader.registerEventListener("createAnnotationContextMenu", handler, pluginID)
 * (chrome/content/zotero/xpcom/reader.js). `params.ids` are annotation *keys*
 * (the reader works with keys, cf. onDeleteAnnotations); `reader.itemID` is the
 * PDF attachment; `append({ label, onCommand })` adds the menu item.
 *
 * IMPORTANT: the target picker (selectItemsDialog) is MODAL. Opening a modal
 * dialog synchronously from inside the context-menu command spins a nested
 * event loop while the reader's native menu code is still on the stack, which
 * crashes Zotero. We therefore defer the work with setTimeout(0) so it runs
 * after the menu has closed.
 */

async function createReferenceFromAnnotation(
  reader: { itemID: number },
  annKey: string,
): Promise<void> {
  try {
    const att = Zotero.Items.get(reader.itemID);
    if (!att) return;
    const source = att.parentItemID
      ? Zotero.Items.get(att.parentItemID)
      : false;
    if (!source) return;

    const ann = Zotero.Items.getByLibraryAndKey(att.libraryID, annKey) as
      | (Zotero.Item & { annotationPageLabel?: string })
      | false;
    const pageLabel = ann ? ann.annotationPageLabel || undefined : undefined;

    const win = Zotero.getMainWindow();
    const targetIDs = pickItems(win as unknown as Window).filter(
      (id) => id !== source.id,
    );
    if (targetIDs.length === 0) return;

    const links = getLinks(source);
    let added = 0;
    let lastTitle = "";
    for (const id of targetIDs) {
      const target = Zotero.Items.get(id);
      if (!target) continue;
      const link = makeLink(target.key, target.libraryID);
      if (pageLabel) link.sourcePages = pageLabel;
      link.sourceAttachmentKey = att.key;
      link.sourceAnnotationKey = annKey;
      links.push(link);
      added++;
      lastTitle = target.getDisplayTitle();
    }
    if (added === 0) return;
    await setLinks(source, links);

    const pw = new ztoolkit.ProgressWindow(addon.data.config.addonName);
    pw.createLine({
      text:
        added === 1
          ? `${getString("reader-ref-created")} → ${lastTitle}` +
            (pageLabel ? ` (${getString("anchor-page")} ${pageLabel})` : "")
          : `${getString("reader-ref-created")} (${added})`,
      type: "success",
    }).show();
    pw.startCloseTimer(3000);
  } catch (e) {
    ztoolkit.log("QRef: failed to create reference from annotation", e);
  }
}

function handler(event: ReaderEvent): void {
  const { reader, params, append } = event;
  const annKey: string | undefined = params?.ids?.[0];
  if (!annKey) return;
  append({
    label: getString("reader-add-ref"),
    onCommand: () => {
      // Defer: opening the modal picker from within the menu command would
      // spin a nested event loop on the reader's native stack and crash.
      const win = Zotero.getMainWindow() as Window & {
        setTimeout(fn: () => void, ms: number): number;
      };
      win.setTimeout(() => {
        void createReferenceFromAnnotation(reader, annKey);
      }, 0);
    },
  });
}

export function registerReaderHook(): void {
  zReader().registerEventListener(
    "createAnnotationContextMenu",
    handler,
    addon.data.config.addonID,
  );
}

export function unregisterReaderHook(): void {
  zReader().unregisterEventListener("createAnnotationContextMenu", handler);
}
