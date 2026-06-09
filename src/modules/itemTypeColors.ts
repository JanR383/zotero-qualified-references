/**
 * Fixed node colours by item type for the reference graph (N5), toggled by the
 * `graphColorByType` pref. Deliberately distinct hues from the green↔red stance
 * palette (which colours the edges): violet / blue / amber / grey. Values from
 * the Open Color palette; a slightly lighter variant is used in dark mode.
 *
 * Pure data (no Zotero globals) so it can be bundled into the graph script.
 */

export interface ThemePair {
  light: string;
  dark: string;
}

const COLORS: Record<string, ThemePair> = {
  book: { light: "#7048e8", dark: "#9775fa" }, // violet
  bookSection: { light: "#1971c2", dark: "#4dabf7" }, // blue
  journalArticle: { light: "#e8590c", dark: "#ffa94d" }, // amber/orange
  default: { light: "#868e96", dark: "#adb5bd" }, // grey
};

/** The item types that get their own colour/shape (others → "default"). */
export const TYPED_KEYS = ["book", "bookSection", "journalArticle"] as const;

export function typeColor(itemType: string, isDark: boolean): string {
  const pair = COLORS[itemType] ?? COLORS.default;
  return isDark ? pair.dark : pair.light;
}

/**
 * Node shape per item type (N5b): a colour-independent encoding so types stay
 * distinguishable in greyscale / for colour-blind users / when colour-by-type
 * is off. journalArticle = circle, book = square, bookSection = triangle,
 * everything else = diamond.
 */
export type NodeShape = "circle" | "square" | "triangle" | "diamond";

const SHAPES: Record<string, NodeShape> = {
  journalArticle: "circle",
  book: "square",
  bookSection: "triangle",
};

export function typeShape(itemType: string): NodeShape {
  return SHAPES[itemType] ?? "diamond";
}

/** Unicode glyphs for the legend (drawn coloured). */
export const SHAPE_GLYPH: Record<NodeShape, string> = {
  circle: "●",
  square: "■",
  triangle: "▲",
  diamond: "◆",
};
