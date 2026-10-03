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

/** Per-tag colour choice: a slot of `palette`, or none (= automatic). */
export interface TagColorPick {
  palette: string[];
  chosen: Map<string, number>;
  /** The colour a selected tag currently gets. */
  colorOf: (key: string) => string | undefined;
}

export function buildTagSelect(
  strings: {
    tags: string;
    tagsFilter: string;
    tagsNone: string;
    tagColor: string;
    tagColorAuto: string;
  },
  selected: Set<string>,
  colors: TagColorPick,
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
  // Tag whose colour swatches are shown below its row, if any.
  let picking: string | null = null;

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
        if (picking === key) picking = null;
        updateButton();
        // Re-sort: a checked tag moves to the top, an unchecked one back.
        changed();
      });
      const text = create("span");
      text.textContent = opt.name;
      if (opt.color) text.style.color = opt.color; // Zotero coloured tag
      if (opt.missing) text.style.opacity = "0.6"; // renamed, deleted or not in scope
      row.append(box, text);

      const color = selected.has(key) ? colors.colorOf(key) : undefined;
      if (!color) {
        list.appendChild(row);
        continue;
      }
      // Selected and present: a swatch that opens the colour choice.
      row.style.flex = "1";
      const line = create("div");
      line.style.display = "flex";
      line.style.alignItems = "center";
      const swatch = swatchButton(color, strings.tagColor);
      swatch.addEventListener("click", () => {
        picking = picking === key ? null : key;
        changed(false);
      });
      line.append(row, swatch);
      list.appendChild(line);
      if (picking === key) list.appendChild(colorChoices(key, color));
    }
  };

  const swatchButton = (color: string, title: string): HTMLElement => {
    const b = create("button");
    b.title = title;
    b.style.width = "16px";
    b.style.height = "16px";
    b.style.minWidth = "0";
    b.style.margin = "0 4px";
    b.style.padding = "0";
    b.style.border = "1px solid var(--material-border-quarternary, #888)";
    b.style.borderRadius = "3px";
    b.style.background = color;
    b.style.cursor = "pointer";
    return b;
  };

  // The palette's six colours plus "automatic" (Zotero colour or next free).
  const colorChoices = (key: string, current: string): HTMLElement => {
    const strip = create("div");
    strip.style.display = "flex";
    strip.style.flexWrap = "wrap";
    strip.style.gap = "2px";
    strip.style.padding = "2px 4px 4px 26px";
    const pick = (slot: number | null): void => {
      if (slot === null) colors.chosen.delete(key);
      else colors.chosen.set(key, slot);
      picking = null;
      changed();
    };
    colors.palette.forEach((c, slot) => {
      const b = swatchButton(c, strings.tagColor);
      b.style.margin = "0";
      if (
        colors.chosen.get(key) === slot ||
        (c === current && !colors.chosen.has(key))
      ) {
        b.style.outline = "2px solid CanvasText";
        b.style.outlineOffset = "1px";
      }
      b.addEventListener("click", () => pick(slot));
      strip.appendChild(b);
    });
    const auto = create("button");
    auto.textContent = "A";
    auto.title = strings.tagColorAuto;
    auto.style.minWidth = "0";
    auto.style.height = "16px";
    auto.style.padding = "0 4px";
    auto.style.fontSize = "10px";
    auto.style.lineHeight = "1";
    auto.style.cursor = "pointer";
    if (!colors.chosen.has(key)) auto.style.fontWeight = "bold";
    auto.addEventListener("click", () => pick(null));
    strip.appendChild(auto);
    return strip;
  };

  /** Re-render the list in place; `notify` = the selection or colours changed. */
  const changed = (notify = true): void => {
    if (notify) onChange();
    const scroll = list.scrollTop;
    renderList();
    list.scrollTop = scroll;
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
    if (open) {
      renderList(); // colours of selected tags are known only after a refresh
      place();
    }
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
