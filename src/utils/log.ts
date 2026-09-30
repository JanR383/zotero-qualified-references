import { config } from "../../package.json";

/**
 * Write to Zotero's debug output (Help → Debug Output Logging), prefixed with
 * the plugin name. Errors keep their message and stack; other objects are
 * JSON-encoded. Development builds also log to the browser console.
 */
export function log(...data: unknown[]): void {
  const text = data.map(format).join(" ");
  Zotero.debug(`[${config.addonName}] ${text}`);
  if (__env__ === "development") {
    Zotero.getMainWindow()?.console?.log(`[${config.addonName}]`, ...data);
  }
}

function format(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.message}\n${value.stack ?? ""}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * A short notice in Zotero's popup at the bottom of the main window, headed by
 * the plugin name. Closes after `closeAfterMs` or on click.
 */
export function showNotice(text: string, closeAfterMs = 5000): void {
  const pw = new Zotero.ProgressWindow({ closeOnClick: true });
  pw.changeHeadline(
    config.addonName,
    `chrome://${config.addonRef}/content/icons/icon-48.png`,
  );
  // An ItemProgress line shows the text verbatim; addDescription would turn
  // <a> markup in it (e.g. from an item title) into links.
  new pw.ItemProgress("", text);
  pw.show();
  pw.startCloseTimer(closeAfterMs);
}
