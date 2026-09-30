import { config } from "../package.json";

/**
 * Shared helpers for the integration tests. Not a test file itself (no
 * `.test.ts` suffix), so the scaffold only bundles it via imports.
 */

/**
 * Point the `addon`/`ztoolkit` globals of this test bundle at the live plugin
 * instance. Plugin modules imported by a test reach the reverse index, locale
 * and toolkit through these globals, which the plugin only defines on its own
 * sandbox — without this they would be undefined here.
 */
export function wirePluginGlobals(): void {
  const plugin = (Zotero as any)[config.addonInstance];
  (globalThis as any).addon = plugin;
  (globalThis as any).ztoolkit = plugin.data.ztoolkit;
}

export async function makeItem(
  libraryID: number,
  title: string,
  extra?: string,
): Promise<Zotero.Item> {
  const item = new Zotero.Item("journalArticle");
  item.libraryID = libraryID;
  item.setField("title", title);
  if (extra !== undefined) item.setField("extra", extra);
  await item.saveTx();
  return item;
}

export async function eraseItems(
  items: Array<Zotero.Item | undefined>,
): Promise<void> {
  for (const item of items) {
    if (item && Zotero.Items.get(item.id)) await item.eraseTx();
  }
}

/**
 * Create a local group library, the way Zotero's own test suite does
 * (support.js createGroup). No server is involved; the library only exists in
 * the test profile's database.
 */
export async function createGroup(name: string): Promise<any> {
  const group = new (Zotero as any).Group();
  group.id = 100000 + Math.floor(Math.random() * 900000);
  group.name = name;
  group.description = "";
  group.editable = true;
  group.filesEditable = true;
  group.version = 0;
  group.archived = false;
  await group.saveTx();
  return group;
}

/**
 * Poll until `cond` holds. Notifier observers run after the saving transaction
 * commits and the group-copy guard is fire-and-forget, so their effects are
 * not guaranteed to be visible when saveTx() resolves.
 */
export async function waitFor(
  cond: () => boolean,
  message: string,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for: ${message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Give fire-and-forget notifier work (the group-copy guard started by an `add`
 * event) time to finish. There is no completion signal to wait on, so this is
 * a plain delay; use it only where a still-running guard would race the test.
 */
export function settle(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const refsLine = (json: unknown): string =>
  `Reference-Graph: ${JSON.stringify(json)}`;

export const COPY_PREF = `${config.prefsPrefix}.copyRefsToGroup`;

/**
 * A PDF attachment record under `parent`. No file is written: the tests only
 * need the item (and annotations under it), never the PDF on disk.
 */
export async function makePdfAttachment(
  parent: Zotero.Item | undefined,
  libraryID: number,
): Promise<Zotero.Item> {
  const att = new Zotero.Item("attachment");
  att.libraryID = libraryID;
  if (parent) att.parentID = parent.id;
  att.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
  att.attachmentContentType = "application/pdf";
  att.attachmentFilename = "qref-test.pdf";
  await att.saveTx();
  return att;
}

/** An HTML element in the main window's document to render UI into. */
export function makeBody(): HTMLElement {
  const doc = Zotero.getMainWindow().document;
  return doc.createElementNS("http://www.w3.org/1999/xhtml", "div") as any;
}
