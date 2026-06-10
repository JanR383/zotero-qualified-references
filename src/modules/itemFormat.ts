import { config } from "../../package.json";
import { zDate } from "../utils/zoteroApis";

/**
 * Configurable item display format (N2). Which of author / year / title are
 * shown is a user preference, set independently for the item pane + list
 * ("references") and for the graph. Composed as "Author (Year): Title", with
 * any missing/disabled parts dropped; falls back to getDisplayTitle().
 */

export interface FieldSet {
  author: boolean;
  year: boolean;
  title: boolean;
}

function boolPref(key: string): boolean {
  return Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true) === true;
}

/** Field set for the item pane + list view ("references and back-links"). */
export function paneFields(): FieldSet {
  return {
    author: boolPref("displayPaneAuthor"),
    year: boolPref("displayPaneYear"),
    title: boolPref("displayPaneTitle"),
  };
}

/** Field set for the reference graph. */
export function graphFields(): FieldSet {
  return {
    author: boolPref("displayGraphAuthor"),
    year: boolPref("displayGraphYear"),
    title: boolPref("displayGraphTitle"),
  };
}

export function formatItem(item: Zotero.Item, f: FieldSet): string {
  const author = f.author
    ? (item.getField("firstCreator") as string) || ""
    : "";
  let year = "";
  if (f.year) {
    const date = (item.getField("date") as string) || "";
    const parsed = date ? zDate().strToDate(date) : null;
    if (parsed && parsed.year) year = String(parsed.year);
  }
  const title = f.title ? item.getDisplayTitle() : "";

  let meta = author;
  if (year) meta = meta ? `${meta} (${year})` : `(${year})`;
  let out = meta;
  if (title) out = out ? `${out}: ${title}` : title;
  return out.trim() || item.getDisplayTitle();
}
