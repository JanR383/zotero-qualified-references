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
  id: string; // "all" | `lib:<libraryID>` | `col:<collectionID>`
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

/**
 * Build the dropdown options: "All", then each library with its full collection
 * tree indented underneath.
 */
export function buildScopeOptions(): ScopeOption[] {
  const options: ScopeOption[] = [{ id: "all", label: getString("scope-all") }];
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
