import { getString } from "../utils/locale";

/**
 * Scope filtering for the graph/list views (N6). By default both views span the
 * whole reverse index across all libraries; a scope narrows them to a single
 * library or a collection (folder) including its sub-collections.
 *
 * A ScopeOption is a flat dropdown entry. The window passes the chosen id back
 * to the parent, which rebuilds the data via makePredicate() — kept here so the
 * Zotero.Collections/Libraries access stays in one place.
 */

export interface ScopeOption {
  id: string; // "all" | "sel" | `lib:<libraryID>` | `col:<collectionID>`
  label: string; // indented for the collection tree
}

const INDENT = "  "; // two NBSP per nesting level (preserved in <option>)

/** Append a collection and its sub-collections as indented options. */
function pushCollectionTree(
  out: ScopeOption[],
  collection: Zotero.Collection,
  depth: number,
): void {
  out.push({
    id: `col:${collection.id}`,
    label: INDENT.repeat(depth) + collection.name,
  });
  for (const child of collection.getChildCollections()) {
    pushCollectionTree(out, child, depth + 1);
  }
}

/** A row of Zotero's collection tree (only what the selection scope reads). */
interface CollectionTreeRow {
  ref: { id: number; libraryID: number };
  isLibrary(includeGlobal?: boolean): boolean;
  isCollection(): boolean;
}

/**
 * The selected rows of Zotero's collection tree. Zotero 10 allows selecting
 * several libraries/collections at once; Zotero 9 lacks this getter, so the
 * "current selection" scope (G7) is not offered there.
 */
function selectedTreeRows(): CollectionTreeRow[] | undefined {
  const pane = Zotero.getActiveZoteroPane() as unknown as {
    getCollectionTreeRows?: () => CollectionTreeRow[];
  } | null;
  if (typeof pane?.getCollectionTreeRows !== "function") return undefined;
  return pane.getCollectionTreeRows();
}

/**
 * Build the dropdown options: "All", "Current selection" (Zotero 10), then each
 * library with its full collection tree indented underneath.
 */
export function buildScopeOptions(): ScopeOption[] {
  const options: ScopeOption[] = [{ id: "all", label: getString("scope-all") }];
  if (selectedTreeRows()) {
    options.push({ id: "sel", label: getString("scope-selection") });
  }
  for (const lib of Zotero.Libraries.getAll()) {
    options.push({ id: `lib:${lib.libraryID}`, label: lib.name });
    for (const top of Zotero.Collections.getByLibrary(lib.libraryID)) {
      pushCollectionTree(options, top, 1);
    }
  }
  return options;
}

/**
 * Build an item predicate for the given scope id. Returns undefined for "all"
 * (and for unknown ids) so callers can skip filtering entirely.
 *
 * For a collection scope the descendant collection ids are precomputed once, so
 * each item check is a cheap membership test against its own collections.
 */
export function makePredicate(
  id: string,
): ((item: Zotero.Item) => boolean) | undefined {
  if (id === "sel") return selectionPredicate();
  if (id.startsWith("lib:")) {
    const libraryID = Number(id.slice(4));
    return (item) => item.libraryID === libraryID;
  }
  if (id.startsWith("col:")) {
    const collectionID = Number(id.slice(4));
    const ids = new Set<number>([collectionID]);
    for (const d of Zotero.Collections.getByParent(collectionID, true)) {
      ids.add(d.id);
    }
    return (item) => item.getCollections().some((c) => ids.has(c));
  }
  return undefined; // "all" or unknown → no filter
}

/**
 * Items in the libraries and collections selected in Zotero right now (a
 * snapshot taken when the scope is chosen). Collections include their
 * sub-collections, as in the collection scope. Rows of other kinds (saved
 * searches, trash, …) are ignored; with none left, nothing matches.
 */
function selectionPredicate(): (item: Zotero.Item) => boolean {
  const libraries = new Set<number>();
  const collections = new Set<number>();
  for (const row of selectedTreeRows() ?? []) {
    if (row.isLibrary(true)) {
      libraries.add(row.ref.libraryID);
    } else if (row.isCollection()) {
      collections.add(row.ref.id);
      for (const d of Zotero.Collections.getByParent(row.ref.id, true)) {
        collections.add(d.id);
      }
    }
  }
  return (item) =>
    libraries.has(item.libraryID) ||
    (collections.size > 0 &&
      item.getCollections().some((c) => collections.has(c)));
}
