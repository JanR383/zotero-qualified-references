/**
 * Tag highlighting for the graph view (G12): the user picks any number of tags
 * in the graph window, and items carrying them get a ring in the tag's colour,
 * e.g. primary sources tagged `#Quelle` stand out from the literature that
 * references them.
 *
 * A tag that is one of Zotero's coloured tags keeps its Zotero colour; other
 * tags get one from a fixed palette. Coloured tags are defined per library; all
 * libraries' sets are merged, with the personal library winning a conflict.
 * Tags are matched exactly but case-insensitively (keys are lower-cased).
 *
 * Everything except loadTagColors() is pure, so the graph window bundle can use
 * it too.
 */

export interface TagOption {
  name: string; // display form (first spelling seen)
  color?: string; // Zotero's colour, if it is a coloured tag
}

/**
 * Colours for selected tags without a Zotero colour, used in turn. No reds,
 * greens or greys: those encode stance on the edges.
 */
const FALLBACK_COLORS = [
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#42d4f4",
  "#f032e6",
  "#9a6324",
  "#808000",
  "#000075",
];

export const tagKey = (name: string): string => name.toLowerCase();

/**
 * Merge per-library coloured-tag maps (as returned by Zotero.Tags.getColors)
 * into lower-cased name → colour. Earlier maps win a conflict, so pass the
 * personal library first.
 */
export function mergeTagColors(
  perLibrary: Map<string, { color: string; position: number }>[],
): Map<string, string> {
  const merged = new Map<string, string>();
  for (const colors of perLibrary) {
    for (const [name, { color }] of colors) {
      const key = tagKey(name);
      if (!merged.has(key)) merged.set(key, color);
    }
  }
  return merged;
}

/** Coloured tags of all libraries, personal library first. */
export function loadTagColors(): Map<string, string> {
  const userID = Zotero.Libraries.userLibraryID;
  const ids = [
    userID,
    ...Zotero.Libraries.getAll()
      .map((lib) => lib.libraryID)
      .filter((id) => id !== userID),
  ];
  return mergeTagColors(ids.map((id) => Zotero.Tags.getColors(id)));
}

/**
 * The distinct tags on the given nodes (case-insensitive), sorted by name, with
 * their Zotero colour where there is one.
 */
export function collectTagOptions(
  nodeTags: string[][],
  zoteroColors: Map<string, string>,
): TagOption[] {
  const byKey = new Map<string, TagOption>();
  for (const tags of nodeTags) {
    for (const name of tags) {
      const key = tagKey(name);
      if (byKey.has(key)) continue;
      const color = zoteroColors.get(key);
      byKey.set(key, color ? { name, color } : { name });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/**
 * Colour each selected tag that occurs in `options`: its Zotero colour, else
 * the next palette colour. The map keeps selection order (= legend order).
 */
export function assignTagColors(
  selected: string[],
  options: TagOption[],
): Map<string, { name: string; color: string }> {
  const byKey = new Map(options.map((o) => [tagKey(o.name), o]));
  const out = new Map<string, { name: string; color: string }>();
  let next = 0;
  for (const key of selected) {
    const opt = byKey.get(key);
    if (!opt || out.has(key)) continue;
    const color = opt.color ?? FALLBACK_COLORS[next++ % FALLBACK_COLORS.length];
    out.set(key, { name: opt.name, color });
  }
  return out;
}

/** Ring colours for a node's tags, in legend order. */
export function ringColors(
  tags: string[],
  assigned: Map<string, { color: string }>,
): string[] {
  const own = new Set(tags.map(tagKey));
  const out: string[] = [];
  for (const [key, { color }] of assigned) {
    if (own.has(key)) out.push(color);
  }
  return out;
}
