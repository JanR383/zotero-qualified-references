import type { Stance } from "./types";

/**
 * Single source for stance presentation metadata (order, glyphs, CSS custom
 * properties). Pure data — safe to bundle into the main plugin script as well
 * as the standalone graph/list window bundles.
 *
 * The actual colours live in addon/content/qref.css (plus the palette override
 * from stancePalette.ts); consumers resolve the custom properties either via
 * CSS var() (DOM) or getComputedStyle (canvas).
 */

export const STANCE_ORDER: Stance[] = [2, 1, 0, -1, -2];

export const STANCE_GLYPH: Record<Stance, string> = {
  2: "++",
  1: "+",
  0: "0",
  [-1]: "−",
  [-2]: "−−",
};

export const STANCE_CSS_VAR: Record<Stance, string> = {
  2: "--qref-stance-strong-pos",
  1: "--qref-stance-pos",
  0: "--qref-stance-neutral",
  [-1]: "--qref-stance-neg",
  [-2]: "--qref-stance-strong-neg",
};

/** CSS value referencing the stance's custom property. */
export function stanceCssValue(stance: Stance): string {
  return `var(${STANCE_CSS_VAR[stance]})`;
}
