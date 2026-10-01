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

/**
 * With `label`, the button keeps that text and works as an action menu (e.g.
 * Export); `alignRight` opens the list towards the left, for buttons at the
 * right edge of the window.
 */
export function buildScopeSelect(
  options: ScopeSelectOption[],
  onChange: (id: string) => void,
  opts: { label?: string; alignRight?: boolean } = {},
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
  labelText.textContent = opts.label ?? options[0]?.label ?? "";
  const caret = create("span");
  caret.textContent = "▾";
  caret.style.flex = "0 0 auto";
  button.append(labelText, caret);

  const menu = create("div");
  menu.style.position = "absolute";
  menu.style.top = "100%";
  if (opts.alignRight) menu.style.right = "0";
  else menu.style.left = "0";
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
    // A real <button> per row so the menu is keyboard-operable (Tab/Enter)
    // without extra key handling; styles reset to look like a plain row.
    const row = create("button");
    row.textContent = opt.label;
    row.style.appearance = "none";
    row.style.display = "block";
    row.style.width = "100%";
    row.style.textAlign = "left";
    row.style.border = "none";
    row.style.background = "transparent";
    row.style.font = "inherit";
    row.style.color = "inherit";
    row.style.whiteSpace = "pre"; // keep collection-tree indentation
    row.style.padding = "2px 8px";
    row.style.cursor = "pointer";
    row.style.borderRadius = "3px";
    const highlight = (on: boolean): void => {
      row.style.background = on
        ? "color-mix(in srgb, CanvasText 12%, transparent)"
        : "transparent";
    };
    row.addEventListener("mouseenter", () => highlight(true));
    row.addEventListener("mouseleave", () => highlight(false));
    row.addEventListener("focus", () => highlight(true));
    row.addEventListener("blur", () => highlight(false));
    row.addEventListener("click", () => {
      if (opts.label === undefined) labelText.textContent = opt.label;
      close();
      onChange(opt.id);
    });
    menu.appendChild(row);
  }

  button.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });
  // Escape closes the menu and returns focus to the trigger.
  root.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && menu.style.display !== "none") {
      close();
      button.focus();
    }
  });
  // Click anywhere else closes the menu.
  document.addEventListener("click", close);

  root.append(button, menu);
  return root;
}
