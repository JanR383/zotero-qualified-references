/**
 * Tag picker for the graph window (G12): a button that opens a panel with a
 * filter field and one checkbox per tag. Built by hand for the same reason as
 * shared/scopeSelect.ts (native <select> popups misrender in chrome windows).
 */
import { create } from "../shared/dom";
import { orderTagOptions, type TagOption } from "../modules/tagHighlight";

declare const document: Document;
declare const window: Window;

export interface TagSelect {
  root: HTMLElement;
  /** Replace the offered tags (on scope change), keeping the selection. */
  setOptions(options: TagOption[]): void;
}

export function buildTagSelect(
  strings: { tags: string; tagsFilter: string; tagsNone: string },
  selected: Set<string>,
  onChange: () => void,
): TagSelect {
  const root = create("div");
  root.style.position = "relative";
  root.style.display = "inline-block";

  const button = create("button");
  button.style.cursor = "pointer";

  const panel = create("div");
  // Fixed, not absolute: the controls box scrolls (overflow: auto) and would
  // clip an absolutely positioned panel. Placed under the button on open.
  const PANEL_W = 240;
  panel.style.position = "fixed";
  panel.style.width = `${PANEL_W}px`;
  panel.style.boxSizing = "border-box";
  panel.style.zIndex = "10";
  panel.style.padding = "4px";
  panel.style.background = "Canvas";
  panel.style.color = "CanvasText";
  panel.style.border = "1px solid var(--material-border-quarternary, #ccc)";
  panel.style.borderRadius = "4px";
  panel.style.display = "none";
  // Clicks inside the panel (checkboxes, filter) must not close it.
  panel.addEventListener("click", (e: Event) => e.stopPropagation());

  const filter = create("input") as HTMLInputElement;
  filter.type = "search";
  filter.placeholder = strings.tagsFilter;
  filter.style.width = "100%";
  filter.style.boxSizing = "border-box";

  const list = create("div");
  list.style.maxHeight = "280px";
  list.style.overflowY = "auto";
  list.style.marginTop = "4px";

  let options: TagOption[] = [];

  const updateButton = (): void => {
    button.textContent =
      selected.size > 0
        ? `${strings.tags} (${selected.size}) ▾`
        : `${strings.tags} ▾`;
  };

  const renderList = (): void => {
    list.replaceChildren();
    const q = filter.value.trim().toLowerCase();
    const shown = orderTagOptions(options, selected).filter((o) =>
      o.key.includes(q),
    );
    if (shown.length === 0) {
      const none = create("div");
      none.style.opacity = "0.6";
      none.style.padding = "2px 4px";
      none.textContent = strings.tagsNone;
      list.appendChild(none);
      return;
    }
    for (const opt of shown) {
      const key = opt.key;
      const row = create("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.padding = "1px 4px";
      row.style.cursor = "pointer";
      const box = create("input") as HTMLInputElement;
      box.type = "checkbox";
      box.checked = selected.has(key);
      box.addEventListener("change", () => {
        if (box.checked) selected.add(key);
        else selected.delete(key);
        updateButton();
        onChange();
        // Re-sort: a checked tag moves to the top, an unchecked one back.
        const scroll = list.scrollTop;
        renderList();
        list.scrollTop = scroll;
      });
      const text = create("span");
      text.textContent = opt.name;
      if (opt.color) text.style.color = opt.color; // Zotero coloured tag
      if (opt.missing) text.style.opacity = "0.6"; // renamed, deleted or not in scope
      row.append(box, text);
      list.appendChild(row);
    }
  };

  const place = (): void => {
    const r = button.getBoundingClientRect();
    const left = Math.min(r.right - PANEL_W, window.innerWidth - PANEL_W - 4);
    panel.style.left = `${Math.max(4, left)}px`;
    panel.style.top = `${r.bottom + 2}px`;
    // Leave room for filter field + padding below the list.
    const room = window.innerHeight - r.bottom - 50;
    list.style.maxHeight = `${Math.max(80, Math.min(280, room))}px`;
  };
  const close = (): void => {
    panel.style.display = "none";
  };
  window.addEventListener("resize", close);
  // A scroll of the controls box would leave the fixed panel behind.
  document.addEventListener(
    "scroll",
    (e: Event) => {
      if (!panel.contains(e.target as Node)) close();
    },
    true,
  );

  filter.addEventListener("input", renderList);
  button.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    const open = panel.style.display === "none";
    if (open) place();
    panel.style.display = open ? "block" : "none";
    if (open) filter.focus();
  });
  root.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && panel.style.display !== "none") {
      panel.style.display = "none";
      button.focus();
    }
  });
  document.addEventListener("click", () => {
    panel.style.display = "none";
  });

  panel.append(filter, list);
  root.append(button, panel);
  updateButton();

  return {
    root,
    setOptions(next: TagOption[]): void {
      options = next;
      renderList();
    },
  };
}
