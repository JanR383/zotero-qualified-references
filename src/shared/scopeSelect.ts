/**
 * A minimal custom dropdown for the standalone graph/list windows.
 *
 * Native HTML <select> popups render incorrectly in Zotero's chrome window
 * context (ghosted / overlapping option text, not clickable), so we build a
 * button + an absolutely-positioned list we fully control. Theme-aware via CSS
 * system colours (Canvas/CanvasText) and the shared qref.css border variable.
 */
import { create } from "./dom";

declare const document: Document;

export interface ScopeSelectOption {
  id: string;
  label: string; // may contain leading spaces for collection-tree indentation
}

export function buildScopeSelect(
  options: ScopeSelectOption[],
  onChange: (id: string) => void,
): HTMLElement {
  const root = create("div");
  root.style.position = "relative";
  root.style.display = "inline-block";

  const button = create("button");
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.gap = "6px";
  button.style.maxWidth = "260px";
  button.style.cursor = "pointer";
  const labelText = create("span");
  labelText.style.overflow = "hidden";
  labelText.style.textOverflow = "ellipsis";
  labelText.style.whiteSpace = "nowrap";
  labelText.textContent = options[0]?.label ?? "";
  const caret = create("span");
  caret.textContent = "▾";
  caret.style.flex = "0 0 auto";
  button.append(labelText, caret);

  const menu = create("div");
  menu.style.position = "absolute";
  menu.style.top = "100%";
  menu.style.left = "0";
  menu.style.minWidth = "100%";
  menu.style.maxHeight = "320px";
  menu.style.overflowY = "auto";
  menu.style.zIndex = "10";
  menu.style.marginTop = "2px";
  menu.style.padding = "2px";
  menu.style.background = "Canvas";
  menu.style.color = "CanvasText";
  menu.style.border = "1px solid var(--material-border-quarternary, #ccc)";
  menu.style.borderRadius = "4px";
  menu.style.display = "none";

  const close = (): void => {
    menu.style.display = "none";
  };

  for (const opt of options) {
    const row = create("div");
    row.textContent = opt.label;
    row.style.whiteSpace = "pre"; // keep collection-tree indentation
    row.style.padding = "2px 8px";
    row.style.cursor = "pointer";
    row.style.borderRadius = "3px";
    row.addEventListener("mouseenter", () => {
      row.style.background = "color-mix(in srgb, CanvasText 12%, transparent)";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "transparent";
    });
    row.addEventListener("click", () => {
      labelText.textContent = opt.label;
      close();
      onChange(opt.id);
    });
    menu.appendChild(row);
  }

  button.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });
  // Click anywhere else closes the menu.
  document.addEventListener("click", close);

  root.append(button, menu);
  return root;
}
