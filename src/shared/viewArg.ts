import type { ScopeOption } from "../modules/scope";
import type { Stance } from "../modules/types";

/**
 * The part of the window argument the graph and list windows share. Handed
 * over via `window.arguments[0]` (see openViewWindow in modules/navigation.ts).
 */
export interface ViewArgBase {
  selectItem: (id: number) => void;
  /** Optional stance-palette override CSS (M7); injected before reading vars. */
  paletteCss?: string;
  /** Scope dropdown options (N6); first is "all", matching the initial data. */
  scopes: ScopeOption[];
  /**
   * Rebuild the window's data for a scope id, returned as a JSON string. The
   * window is a separate global: a plain object returned by this parent-side
   * function would cross as an Xray wrapper and read as empty, so it is
   * serialized here and JSON.parsed back into native objects in the window.
   */
  getScopedData: (id: string) => string;
}

/** Strings both windows use. */
export interface ViewStringsBase {
  title: string;
  empty: string;
  scope: string;
  /** Localized stance names (legend, filter tooltips). */
  stances: Record<Stance, string>;
}
