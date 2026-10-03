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
 * The six colours offered for highlighted tags, besides Zotero's own tag
 * colours. No reds, greens or greys: those encode stance on the edges.
 */
export const TAG_PALETTE = [
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#42d4f4",
  "#f032e6",
  "#9a6324",
];

/**
 * The same six slots for the colour-blind stance palette: a subset of Paul
 * Tol's "muted" scheme (https://personal.sron.nl/~pault/), distinguishable
 * under red-green and blue-yellow colour blindness and apart from that
 * palette's blues and oranges.
 */
export const TAG_PALETTE_COLORBLIND = [
  "#332288",
  "#44AA99",
  "#117733",
  "#DDCC77",
  "#882255",
  "#AA4499",
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
 * Colour each selected tag that occurs in `options`: the palette slot picked
 * for it in `chosen`, else its Zotero colour, else the first palette colour no
 * other selected tag uses (cycling once all are taken). The map keeps
 * selection order (= legend order).
 */
export function assignTagColors(
  selected: string[],
  options: TagOption[],
  palette: string[] = TAG_PALETTE,
  chosen: ReadonlyMap<string, number> = new Map(),
): Map<string, { name: string; color: string }> {
  const byKey = new Map(options.map((o) => [tagKey(o.name), o]));
  const keys = [...new Set(selected)].filter((k) => byKey.has(k));
  const fixed = new Map<string, string>();
  for (const key of keys) {
    const slot = chosen.get(key);
    const color =
      slot !== undefined && palette[slot]
        ? palette[slot]
        : byKey.get(key)!.color;
    if (color) fixed.set(key, color);
  }
  const used = new Set(fixed.values());
  const out = new Map<string, { name: string; color: string }>();
  let next = 0;
  for (const key of keys) {
    let color = fixed.get(key);
    if (!color) {
      color =
        palette.find((c) => !used.has(c)) ?? palette[next++ % palette.length];
      used.add(color);
    }
    out.set(key, { name: byKey.get(key)!.name, color });
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

/**
 * Order the tag picker: selected tags first (in selection order), then the
 * rest alphabetically as given. A selected tag missing from `options` (renamed
 * or deleted since, or absent from this scope) is still listed, under its key,
 * so it can be deselected.
 */
export function orderTagOptions(
  options: TagOption[],
  selected: Iterable<string>,
): (TagOption & { key: string; missing?: true })[] {
  const byKey = new Map(options.map((o) => [tagKey(o.name), o]));
  const chosen = new Set(selected);
  const top: (TagOption & { key: string; missing?: true })[] = [];
  for (const key of chosen) {
    const opt = byKey.get(key);
    top.push(opt ? { ...opt, key } : { name: key, key, missing: true });
  }
  const rest = options
    .filter((o) => !chosen.has(tagKey(o.name)))
    .map((o) => ({ ...o, key: tagKey(o.name) }));
  return [...top, ...rest];
}
