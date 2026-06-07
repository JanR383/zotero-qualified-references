import { config } from "../../package.json";
import type { Stance } from "./types";

/**
 * Stance colour palettes (M7).
 *
 * The default palette lives in addon/content/qref.css (`--qref-stance-*`). This
 * module is the single source for any *non-default* palette: it emits a CSS
 * override (same custom properties) that is injected after qref.css, so the
 * item pane, the "Referenced by" section and the graph all switch together.
 *
 * The "colorblind" preset uses the Okabe–Ito palette (red–green-colour-blind
 * safe; blue ↔ orange/vermillion instead of green ↔ red):
 *   https://jfly.uni-koeln.de/color/
 */

export type StancePaletteId = "default" | "colorblind";

/** Full preference key (scaffold prefixes prefs.js keys with this prefix). */
export const PALETTE_PREF = `${config.prefsPrefix}.stancePalette`;

const VAR: Record<Stance, string> = {
  2: "--qref-stance-strong-pos",
  1: "--qref-stance-pos",
  0: "--qref-stance-neutral",
  [-1]: "--qref-stance-neg",
  [-2]: "--qref-stance-strong-neg",
};

const STANCES: Stance[] = [2, 1, 0, -1, -2];

// Only the five background vars are overridden; --qref-stance-fg (white in
// light, dark in dark) from qref.css remains and reads well on these colours.
const COLORBLIND: {
  light: Record<Stance, string>;
  dark: Record<Stance, string>;
} = {
  light: {
    2: "#0072B2",
    1: "#56B4E9",
    0: "#999999",
    [-1]: "#E69F00",
    [-2]: "#D55E00",
  },
  dark: {
    2: "#4AA3DF",
    1: "#7EC8F0",
    0: "#B0B0B0",
    [-1]: "#F0B94D",
    [-2]: "#EF7A3D",
  },
};

function rootBlock(colors: Record<Stance, string>): string {
  return `:root{${STANCES.map((s) => `${VAR[s]}:${colors[s]};`).join("")}}`;
}

/** CSS that overrides qref.css for the given palette ("" for the default). */
export function paletteOverrideCss(id: StancePaletteId): string {
  if (id !== "colorblind") return "";
  return (
    rootBlock(COLORBLIND.light) +
    `@media (prefers-color-scheme: dark){${rootBlock(COLORBLIND.dark)}}`
  );
}

/** Current palette from prefs, defaulting to "default" when unset/unknown. */
export function getCurrentPaletteId(): StancePaletteId {
  return Zotero.Prefs.get(PALETTE_PREF, true) === "colorblind"
    ? "colorblind"
    : "default";
}
