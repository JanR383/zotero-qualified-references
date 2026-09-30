/**
 * Tag picker for the graph window (G12): a button that opens a panel with a
 * filter field and one checkbox per tag. Built by hand for the same reason as
 * shared/scopeSelect.ts (native <select> popups misrender in chrome windows).
 */
import { create } from "../shared/dom";
import { tagKey, type TagOption } from "../modules/tagHighlight";

declare const document: Document;

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
  panel.style.position = "absolute";
  panel.style.top = "100%";
  panel.style.right = "0";
  panel.style.width = "240px";
  panel.style.zIndex = "10";
  panel.style.marginTop = "2px";
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
    const shown = options.filter((o) => tagKey(o.name).includes(q));
    if (shown.length === 0) {
      const none = create("div");
      none.style.opacity = "0.6";
      none.style.padding = "2px 4px";
      none.textContent = strings.tagsNone;
      list.appendChild(none);
      return;
    }
    for (const opt of shown) {
      const key = tagKey(opt.name);
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
      });
      const text = create("span");
      text.textContent = opt.name;
      if (opt.color) text.style.color = opt.color; // Zotero coloured tag
      row.append(box, text);
      list.appendChild(row);
    }
  };

  filter.addEventListener("input", renderList);
  button.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    const open = panel.style.display === "none";
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
