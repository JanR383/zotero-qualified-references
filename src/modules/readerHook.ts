import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { pickItems } from "./picker";
import { getLinks, makeLink, setLinks } from "./storage";
import { refreshSectionIfVisible } from "./referenceSection";
import {
  zReader,
  type ReaderEvent,
  type ReaderSelectionEvent,
} from "../utils/zoteroApis";

/**
 * Reader integration (M6): create a qualified reference from inside the PDF
 * reader. Two entry points:
 *
 *  1. `createAnnotationContextMenu` — right-click an existing highlight and pick
 *     a target B → reference A→B anchored to that annotation.
 *  2. `renderTextSelectionPopup` (N7) — select text (no annotation needed): a
 *     button in the selection popup creates a highlight on the fly and anchors a
 *     reference to it. Gated by the `readerSelectionButton` pref.
 *
 * `reader.itemID` is the PDF attachment; references live on its parent regular
 * item. Annotation keys are item keys (the reader works with keys).
 *
 * IMPORTANT: the target picker (selectItemsDialog) is MODAL. Opening it
 * synchronously from inside a reader menu/popup command spins a nested event
 * loop while the reader's native code is still on the stack, which crashes
 * Zotero. We therefore defer the work with setTimeout(0).
 */

/**
 * Shared flow for both entry points: pick target item(s), append A→B link(s)
 * anchored to `annKey`, persist, refresh the section and confirm.
 */
async function createReference(
  att: Zotero.Item,
  source: Zotero.Item,
  annKey: string,
  pageLabel: string | undefined,
): Promise<void> {
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
  refreshSectionIfVisible(source.id);

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
}

/** Resolve the PDF attachment and its parent regular item from a reader. */
function resolveSource(reader: { itemID: number }): {
  att: Zotero.Item;
  source: Zotero.Item;
} | null {
  const att = Zotero.Items.get(reader.itemID);
  if (!att) return null;
  const source = att.parentItemID ? Zotero.Items.get(att.parentItemID) : false;
  if (!source) return null;
  return { att, source };
}

async function createReferenceFromAnnotation(
  reader: { itemID: number },
  annKey: string,
): Promise<void> {
  try {
    const r = resolveSource(reader);
    if (!r) return;
    const ann = Zotero.Items.getByLibraryAndKey(r.att.libraryID, annKey) as
      | (Zotero.Item & { annotationPageLabel?: string })
      | false;
    const pageLabel = ann ? ann.annotationPageLabel || undefined : undefined;
    await createReference(r.att, r.source, annKey, pageLabel);
  } catch (e) {
    ztoolkit.log("QRef: failed to create reference from annotation", e);
  }
}

async function createReferenceFromSelection(
  reader: { itemID: number },
  annotation: _ZoteroTypes.Annotations.AnnotationJson,
): Promise<void> {
  try {
    const r = resolveSource(reader);
    if (!r) return;
    // Persist a highlight as the jump-back anchor for the bare selection, then
    // reuse the normal flow with the new annotation's key. The popup's
    // annotation JSON is a preview without a key, so generate one (saveFromJSON
    // throws "'key' not provided in JSON" otherwise).
    const key = Zotero.Utilities.generateObjectKey();
    const json = { ...annotation, key, type: "highlight" as const };
    if (!json.color) json.color = Zotero.Annotations.DEFAULT_COLOR;
    const saved = await Zotero.Annotations.saveFromJSON(r.att, json);
    await createReference(
      r.att,
      r.source,
      saved.key,
      annotation.pageLabel || undefined,
    );
  } catch (e) {
    ztoolkit.log("QRef: failed to create reference from selection", e);
  }
}

/** Defer a reader command so the modal picker doesn't run on the native stack. */
function deferToMainWindow(fn: () => void): void {
  const win = Zotero.getMainWindow() as Window & {
    setTimeout(fn: () => void, ms: number): number;
  };
  win.setTimeout(fn, 0);
}

function annotationMenuHandler(event: ReaderEvent): void {
  const { reader, params, append } = event;
  // Use the right-clicked annotation (currentID), not the first selected one.
  const annKey: string | undefined = params?.currentID ?? params?.ids?.[0];
  if (!annKey) return;
  append({
    label: getString("reader-add-ref"),
    onCommand: () =>
      deferToMainWindow(() => {
        void createReferenceFromAnnotation(reader, annKey);
      }),
  });
}

function selectionPopupHandler(event: ReaderSelectionEvent): void {
  // Re-check the pref on every popup so the Settings toggle takes effect at once.
  const enabled =
    Zotero.Prefs.get(`${config.prefsPrefix}.readerSelectionButton`, true) !==
    false;
  if (!enabled) return;
  const { reader, doc, params, append } = event;
  const btn = doc.createElement("button");
  btn.textContent = getString("reader-add-ref");
  btn.addEventListener("click", () =>
    deferToMainWindow(() => {
      void createReferenceFromSelection(reader, params.annotation);
    }),
  );
  append(btn);
}

export function registerReaderHook(): void {
  zReader().registerEventListener(
    "createAnnotationContextMenu",
    annotationMenuHandler,
    addon.data.config.addonID,
  );
  zReader().registerEventListener(
    "renderTextSelectionPopup",
    selectionPopupHandler,
    addon.data.config.addonID,
  );
}

export function unregisterReaderHook(): void {
  zReader().unregisterEventListener(
    "createAnnotationContextMenu",
    annotationMenuHandler,
  );
  zReader().unregisterEventListener(
    "renderTextSelectionPopup",
    selectionPopupHandler,
  );
}
