/**
 * Standalone renderer for the reference-list window (N3). Bundled separately
 * (see zotero-plugin.config.ts) and loaded as a classic <script> by
 * addon/content/list.xhtml. Reads its data from `window.arguments[0]`.
 *
 * Plain HTML/CSS (no third-party lib). Stance colours come from qref.css
 * (+ the palette override) via the --qref-stance-* custom properties, which
 * apply directly here since this is regular DOM (not canvas).
 */
import {
  STANCE_GLYPH,
  STANCE_ORDER,
  stanceCssValue,
} from "../modules/stanceMeta";
import { byId, create } from "../shared/dom";
import { buildScopeSelect } from "../shared/scopeSelect";
import { filterNodes } from "./filter";
import { sortNodes, stanceCounts, type SortMode } from "./sort";
import type { Stance } from "../modules/types";
import type { ListArg, ListEntry, ListNode } from "./types";

declare const window: Window & typeof globalThis & { arguments?: unknown[] };
declare const document: Document;

function stancePill(stance: Stance): HTMLElement {
  const pill = create("span");
  pill.className = "pill";
  pill.style.background = stanceCssValue(stance);
  pill.textContent = STANCE_GLYPH[stance];
  return pill;
}

function entryRow(
  entry: ListEntry,
  selectItem: (id: number) => void,
): HTMLElement {
  const row = create("div");
  row.className = "entry";
  row.appendChild(stancePill(entry.stance));
  const label = create("span");
  label.className = "entry-label";
  label.textContent = entry.label;
  label.addEventListener("click", () => selectItem(entry.id));
  row.appendChild(label);
  return row;
}

function section(
  title: string,
  arrow: string,
  entries: ListEntry[],
  selectItem: (id: number) => void,
): HTMLElement | null {
  if (entries.length === 0) return null;
  const wrap = create("div");
  wrap.className = "section";
  const head = create("div");
  head.className = "section-head";
  head.textContent = `${arrow} ${title}`;
  wrap.appendChild(head);
  for (const e of entries) wrap.appendChild(entryRow(e, selectItem));
  return wrap;
}

/** Total count plus one pill per stance present, e.g. "(4) 3 + 1 −" (L6). */
function stanceBalance(
  node: ListNode,
  labels: Record<Stance, string>,
): HTMLElement {
  const wrap = create("span");
  wrap.className = "balance";
  const counts = stanceCounts(node);
  const total = create("span");
  total.textContent = `(${node.outgoing.length + node.incoming.length})`;
  wrap.appendChild(total);
  for (const stance of STANCE_ORDER) {
    if (counts[stance] === 0) continue;
    const pill = stancePill(stance);
    pill.textContent = `${counts[stance]} ${STANCE_GLYPH[stance]}`;
    pill.title = labels[stance];
    wrap.appendChild(pill);
  }
  return wrap;
}

interface NodeRow {
  el: HTMLElement;
  setOpen: (open: boolean) => void;
}

/**
 * One expandable row. The open/closed state lives in `openIds` (not in the
 * DOM), so it survives re-renders from search, filter and scope changes (L1).
 */
function nodeRow(node: ListNode, arg: ListArg, openIds: Set<number>): NodeRow {
  const wrap = create("div");
  wrap.className = "node";

  const header = create("div");
  header.className = "node-head";
  header.tabIndex = 0;

  const caret = create("span");
  caret.className = "caret";

  const title = create("span");
  title.className = "node-title";
  title.textContent = node.label;
  title.addEventListener("click", () => arg.selectItem(node.id));

  header.append(caret, title, stanceBalance(node, arg.strings.stances));
  wrap.appendChild(header);

  const body = create("div");
  body.className = "node-body";
  const out = section(arg.strings.outgoing, "→", node.outgoing, arg.selectItem);
  const inc = section(arg.strings.incoming, "←", node.incoming, arg.selectItem);
  if (out) body.appendChild(out);
  if (inc) body.appendChild(inc);
  wrap.appendChild(body);

  const setOpen = (open: boolean): void => {
    if (open) openIds.add(node.id);
    else openIds.delete(node.id);
    body.style.display = open ? "block" : "none";
    caret.textContent = open ? "▾" : "▸";
    header.setAttribute("aria-expanded", String(open));
  };
  setOpen(openIds.has(node.id));

  // Any header click outside the title toggles (this covers the caret too —
  // a separate caret listener would double-toggle via bubbling and cancel out).
  header.addEventListener("click", (e: Event) => {
    if (e.target !== title) setOpen(!openIds.has(node.id));
  });
  header.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setOpen(true);
    else if (e.key === "ArrowLeft") setOpen(false);
    else return;
    e.preventDefault();
  });

  return { el: wrap, setOpen };
}

/** One checkbox per stance, all checked initially (L3). */
function buildStanceFilter(
  labels: Record<Stance, string>,
  shown: Set<Stance>,
  onChange: () => void,
): HTMLElement {
  const wrap = create("span");
  wrap.className = "stance-filter";
  for (const stance of STANCE_ORDER) {
    const label = create("label");
    label.title = labels[stance];
    const box = create("input") as HTMLInputElement;
    box.type = "checkbox";
    box.checked = true;
    box.addEventListener("change", () => {
      if (box.checked) shown.add(stance);
      else shown.delete(stance);
      onChange();
    });
    label.append(box, stancePill(stance));
    wrap.appendChild(label);
  }
  return wrap;
}

function main(): void {
  const arg = window.arguments?.[0] as ListArg | undefined;
  if (!arg) return;

  document.title = arg.strings.title;
  if (arg.paletteCss) {
    const style = create("style");
    style.textContent = arg.paletteCss;
    (document.head ?? document.documentElement)?.appendChild(style);
  }

  const root = byId("list");
  if (!root) return;

  const empty = byId("empty");
  const openIds = new Set<number>();
  const shown = new Set<Stance>(STANCE_ORDER);
  let nodes = arg.nodes;
  let query = "";
  let sortMode: SortMode = "alpha";
  let rows: NodeRow[] = [];

  const render = (): void => {
    const visible = sortNodes(filterNodes(nodes, query, shown), sortMode);
    root.replaceChildren();
    if (empty) {
      empty.textContent =
        nodes.length === 0 ? arg.strings.empty : arg.strings.noMatch;
      empty.style.display = visible.length === 0 ? "block" : "none";
    }
    rows = visible.map((node) => nodeRow(node, arg, openIds));
    for (const row of rows) root.appendChild(row.el);
  };
  render();

  // Search (L2): filters by the formatted label; hits open automatically.
  const search = byId("search") as HTMLInputElement | null;
  if (search) {
    search.placeholder = arg.strings.search;
    search.addEventListener("input", () => {
      query = search.value;
      render();
      if (query.trim()) for (const row of rows) row.setOpen(true);
    });
  }

  const filterMount = byId("stance-filter");
  if (filterMount) {
    filterMount.replaceWith(
      buildStanceFilter(arg.strings.stances, shown, render),
    );
  }

  // Sort order (L5); not persisted, every window starts alphabetical.
  const sort = byId("sort") as HTMLSelectElement | null;
  if (sort) {
    sort.title = arg.strings.sort;
    const options: [SortMode, string][] = [
      ["alpha", arg.strings.sortAlpha],
      ["count", arg.strings.sortCount],
      ["year", arg.strings.sortYear],
    ];
    for (const [value, text] of options) {
      const option = create("option") as HTMLOptionElement;
      option.value = value;
      option.textContent = text;
      sort.appendChild(option);
    }
    sort.addEventListener("change", () => {
      sortMode = sort.value as SortMode;
      render();
    });
  }

  // Expand acts on the visible rows only; collapse clears every row (L1).
  const expandAll = byId("expand-all");
  if (expandAll) {
    expandAll.textContent = arg.strings.expandAll;
    expandAll.addEventListener("click", () => {
      for (const row of rows) row.setOpen(true);
    });
  }
  const collapseAll = byId("collapse-all");
  if (collapseAll) {
    collapseAll.textContent = arg.strings.collapseAll;
    collapseAll.addEventListener("click", () => {
      openIds.clear();
      for (const row of rows) row.setOpen(false);
    });
  }

  // Scope switcher (N6): rebuild the list for the chosen library/collection.
  // Open rows stay open where the item still appears in the new scope.
  const scopeMount = byId("scope");
  const scopeLabel = byId("scope-label");
  if (scopeMount) {
    if (scopeLabel) scopeLabel.textContent = arg.strings.scope;
    scopeMount.appendChild(
      buildScopeSelect(arg.scopes, (id) => {
        const data = JSON.parse(arg.getScopedData(id)) as {
          nodes: ListNode[];
        };
        nodes = data.nodes;
        render();
      }),
    );
  }
}

main();
