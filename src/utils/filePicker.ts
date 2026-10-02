/**
 * Zotero's async file picker (chrome/content/zotero/modules/filePicker.mjs),
 * typed for the two uses here: choosing where to save an export or backup,
 * and choosing a backup to restore.
 */

interface FilePickerInstance {
  init(win: Window, title: string, mode: number): void;
  appendFilter(title: string, filter: string): void;
  defaultString: string;
  show(): Promise<number>;
  file: string;
  modeOpen: number;
  modeSave: number;
  returnOK: number;
  returnReplace: number;
}

function filePicker(): FilePickerInstance {
  const { FilePicker } = ChromeUtils.importESModule(
    "chrome://zotero/content/modules/filePicker.mjs",
  ) as { FilePicker: new () => FilePickerInstance };
  return new FilePicker();
}

function extFilter(fp: FilePickerInstance, fileName: string): void {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1);
  fp.appendFilter(ext.toUpperCase(), `*.${ext}`);
}

/** Ask where to save `fileName`; the chosen path, or null if cancelled. */
export async function pickSavePath(
  win: Window,
  title: string,
  fileName: string,
): Promise<string | null> {
  const fp = filePicker();
  fp.init(win, title, fp.modeSave);
  extFilter(fp, fileName);
  fp.defaultString = fileName;
  const rv = await fp.show();
  return rv === fp.returnOK || rv === fp.returnReplace ? fp.file : null;
}

/** Ask for a file to open, filtered by the extension of `example`. */
export async function pickOpenPath(
  win: Window,
  title: string,
  example: string,
): Promise<string | null> {
  const fp = filePicker();
  fp.init(win, title, fp.modeOpen);
  extFilter(fp, example);
  const rv = await fp.show();
  return rv === fp.returnOK ? fp.file : null;
}
