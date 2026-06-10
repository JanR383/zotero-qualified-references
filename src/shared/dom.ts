/**
 * Tiny DOM helpers for the standalone window bundles (graph/list).
 *
 * The sandbox tsconfig provides DOM *types* but not the browser global
 * *values*, and types createElement/getElementById as returning the base
 * Element — these wrappers declare the global and cast to HTMLElement.
 */

declare const document: Document;

export function byId(id: string): HTMLElement | null {
  return document.getElementById(id) as HTMLElement | null;
}

export function create(tag: string): HTMLElement {
  return document.createElement(tag) as unknown as HTMLElement;
}
