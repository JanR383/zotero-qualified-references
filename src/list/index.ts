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
import { buildStanceToggles } from "../shared/stanceToggles";
import { applyWindowStyle, onViewDataChanged } from "../shared/viewArg";
import { referencesCsv, referencesMarkdown } from "../shared/export";
import { listExportData } from "./exportData";
import {
  commentMatches,
  filterNodes,
  isMixed,
  searchTerms,
  type ShowMode,
} from "./filter";
import { sortNodes, stanceCounts, type SortMode } from "./sort";
import type { Stance } from "../modules/types";
import type { ListArg, ListEntry, ListNode, ListStrings } from "./types";

declare const window: Window & typeof globalThis & { arguments?: unknown[] };
declare const document: Document;

function stancePill(stance: Stance): HTMLElement {
  const pill = create("span");
  pill.className = "pill";
  pill.style.background = stanceCssValue(stance);
  pill.textContent = STANCE_GLYPH[stance];
  return pill;
}

/** "Source p. 12 · Target p. 3", or "" without pages (L4). */
function pagesText(entry: ListEntry, strings: ListStrings): string {
  return [
    entry.sourcePages ? `${strings.sourcePages} ${entry.sourcePages}` : "",
    entry.targetPages ? `${strings.targetPages} ${entry.targetPages}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One connected item: stance pill in its own column; label (click selects it
 * in Zotero), then pages and a link to the anchored PDF passage, then the
 * comment on one line, the whole of it on click or when the search found it
 * there (L4, C1). `sourceId` is the item that stores the reference.
 */
function entryRow(
  entry: ListEntry,
  sourceId: number,
  arg: ListArg,
  terms: string[],
): HTMLElement {
  const row = create("div");
  row.className = "entry";
  row.appendChild(stancePill(entry.stance));
  const main = create("div");
  main.className = "entry-main";
  const label = create("span");
  label.className = "entry-label";
  label.textContent = entry.label;
  label.addEventListener("click", () => arg.selectItem(entry.id));
  main.appendChild(label);

  const pages = pagesText(entry, arg.strings);
  if (pages || entry.hasAnchor) {
    const meta = create("div");
    meta.className = "entry-meta";
    if (pages) {
      const p = create("span");
      p.textContent = pages;
      meta.appendChild(p);
    }
    if (entry.hasAnchor) {
      const pdf = create("span");
      pdf.className = "entry-pdf";
      pdf.textContent = arg.strings.openPdf;
      pdf.title = arg.strings.openPdfTitle;
      pdf.tabIndex = 0;
      const open = (): void => arg.openAnchor(sourceId, entry.linkId);
      pdf.addEventListener("click", open);
      pdf.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") open();
      });
      meta.appendChild(pdf);
    }
    main.appendChild(meta);
  }

  if (entry.comment) {
    const comment = create("div");
    comment.className = "entry-comment";
    comment.textContent = entry.comment;
    const setOpen = (open: boolean): void => {
      comment.classList.toggle("open", open);
      comment.title = open ? "" : arg.strings.showComment;
    };
    setOpen(commentMatches(entry.comment, terms));
    comment.addEventListener("click", () =>
      setOpen(!comment.classList.contains("open")),
    );
    main.appendChild(comment);
  }
  row.appendChild(main);
  return row;
}

function section(
  title: string,
  arrow: string,
  entries: ListEntry[],
  row: (e: ListEntry) => HTMLElement,
): HTMLElement | null {
  if (entries.length === 0) return null;
  const wrap = create("div");
  wrap.className = "section";
  const head = create("div");
  head.className = "section-head";
  head.textContent = `${arrow} ${title} · ${entries.length}`;
  wrap.appendChild(head);
  for (const e of entries) wrap.appendChild(row(e));
  return wrap;
}

const BAR_HALF = 30; // px per half of the stance bar
const BAR_UNIT_MAX = 6; // px per reference while they fit

/**
 * Diverging stance bar: contradicting references left of the centre line,
 * supporting ones right of it, neutral ones split across it; the strong
 * stances outermost. The side carries the sign, so it reads without telling
 * the colours apart; the colours follow the chosen palette.
 */
function stanceBar(entries: ListEntry[]): HTMLElement {
  const c = stanceCounts(entries);
  const units = Math.max(c[-2] + c[-1], c[1] + c[2]) + c[0] / 2;
  const unit = Math.min(BAR_UNIT_MAX, BAR_HALF / Math.max(units, 1));
  const half = (
    side: "neg" | "pos",
    outer: Stance,
    inner: Stance,
  ): HTMLElement => {
    const el = create("span");
    el.className = `bar-half ${side}`;
    const neutral = create("span");
    neutral.className = "bar-neutral";
    neutral.style.background = stanceCssValue(0);
    neutral.style.width = `${(c[0] * unit) / 2}px`;
    const segs: HTMLElement[] = [];
    for (const stance of [outer, inner]) {
      for (let i = 0; i < c[stance]; i++) {
        const seg = create("span");
        seg.className = "bar-seg";
        seg.style.background = stanceCssValue(stance);
        seg.style.width = `${Math.max(unit - 1, 1)}px`;
        segs.push(seg);
      }
    }
    // Both halves are laid out from the outside in (see .bar-half.neg).
    if (c[0] > 0) segs.push(neutral);
    el.append(...segs);
    return el;
  };
  const bar = create("span");
  bar.className = "bar";
  bar.append(half("neg", -2, -1), half("pos", 2, 1));
  return bar;
}

/**
 * One direction of a row's balance: arrow, number and stance bar, with the
 * breakdown per stance as tooltip. Empty without references that way.
 */
function directionCell(
  arrow: string,
  title: string,
  entries: ListEntry[],
  labels: Record<Stance, string>,
): HTMLElement {
  const cell = create("span");
  cell.className = "dir";
  if (entries.length === 0) return cell;
  const counts = stanceCounts(entries);
  cell.title = [
    title,
    ...STANCE_ORDER.filter((s) => counts[s] > 0).map(
      (s) => `${counts[s]} × ${labels[s]}`,
    ),
  ].join("\n");
  const n = create("span");
  n.className = "dir-count";
  n.textContent = `${arrow} ${entries.length}`;
  cell.append(n, stanceBar(entries));
  return cell;
}

interface NodeRow {
  el: HTMLElement;
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
}

/**
 * One expandable row. The open/closed state lives in `openIds` (not in the
 * DOM), so it survives re-renders from search, filter and scope changes (L1).
 * `mixed` is decided on the unfiltered node (see isMixed).
 */
function nodeRow(
  node: ListNode,
  mixed: boolean,
  arg: ListArg,
  openIds: Set<number>,
  terms: string[],
  onToggle: () => void,
): NodeRow {
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
  title.title = node.label;
  title.addEventListener("click", () => arg.selectItem(node.id));

  const mark = create("span");
  mark.className = "mixed";
  if (mixed) {
    mark.textContent = "±";
    mark.title = arg.strings.mixed;
  }

  const labels = arg.strings.stances;
  header.append(
    caret,
    title,
    mark,
    directionCell("←", arg.strings.incoming, node.incoming, labels),
    directionCell("→", arg.strings.outgoing, node.outgoing, labels),
  );
  wrap.appendChild(header);

  const body = create("div");
  body.className = "node-body";
  // Outgoing references are stored on this item, incoming ones on the other.
  const out = section(arg.strings.outgoing, "→", node.outgoing, (e) =>
    entryRow(e, node.id, arg, terms),
  );
  const inc = section(arg.strings.incoming, "←", node.incoming, (e) =>
    entryRow(e, e.id, arg, terms),
  );
  if (out) body.appendChild(out);
  if (inc) body.appendChild(inc);
  wrap.appendChild(body);

  const setOpen = (open: boolean): void => {
    if (open) openIds.add(node.id);
    else openIds.delete(node.id);
    wrap.classList.toggle("open", open);
    body.style.display = open ? "block" : "none";
    caret.textContent = open ? "▾" : "▸";
    header.setAttribute("aria-expanded", String(open));
  };
  setOpen(openIds.has(node.id));

  // Any header click outside the title toggles (this covers the caret too —
  // a separate caret listener would double-toggle via bubbling and cancel out).
  header.addEventListener("click", (e: Event) => {
    if (e.target === title) return;
    setOpen(!openIds.has(node.id));
    onToggle();
  });
  header.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setOpen(true);
    else if (e.key === "ArrowLeft") setOpen(false);
    else return;
    e.preventDefault();
    onToggle();
  });

  return { el: wrap, isOpen: () => openIds.has(node.id), setOpen };
}

function main(): void {
  const arg = window.arguments?.[0] as ListArg | undefined;
  if (!arg) return;

  document.title = arg.strings.title;
  applyWindowStyle(arg);

  const root = byId("list");
  if (!root) return;

  const empty = byId("empty");
  const toggleAll = byId("toggle-all");
  const openIds = new Set<number>();
  const shown = new Set<Stance>(STANCE_ORDER);
  let nodes = arg.nodes;
  let query = "";
  let sortMode: SortMode = "alpha";
  let showMode: ShowMode = "all";
  let rows: NodeRow[] = [];
  let visible: ListNode[] = [];

  // One button for expand/collapse all (L1): collapses when every visible
  // row is open, expands otherwise.
  const allOpen = (): boolean =>
    rows.length > 0 && rows.every((row) => row.isOpen());
  const updateToggle = (): void => {
    if (toggleAll) {
      toggleAll.textContent = allOpen()
        ? arg.strings.collapseAll
        : arg.strings.expandAll;
    }
  };

  const render = (): void => {
    const terms = searchTerms(query);
    const mixed = new Set(nodes.filter(isMixed).map((n) => n.id));
    visible = sortNodes(filterNodes(nodes, query, shown, showMode), sortMode);
    root.replaceChildren();
    if (empty) {
      empty.textContent =
        nodes.length === 0 ? arg.strings.empty : arg.strings.noMatch;
      empty.style.display = visible.length === 0 ? "block" : "none";
    }
    rows = visible.map((node) =>
      nodeRow(node, mixed.has(node.id), arg, openIds, terms, updateToggle),
    );
    for (const row of rows) root.appendChild(row.el);
    updateToggle();
  };
  render();

  // Search (L2, C1): label and comments; hits open automatically.
  const search = byId("search") as HTMLInputElement | null;
  if (search) {
    search.placeholder = arg.strings.search;
    search.addEventListener("input", () => {
      query = search.value;
      render();
      if (query.trim()) {
        for (const row of rows) row.setOpen(true);
        updateToggle();
      }
    });
  }

  const filterMount = byId("stance-filter");
  if (filterMount) {
    filterMount.replaceWith(
      buildStanceToggles(arg.strings.stances, shown, stanceCssValue, render),
    );
  }

  // Which items to show (A1, B1); not persisted, like the sort order.
  const showMount = byId("show");
  if (showMount) {
    const select = buildScopeSelect(
      [
        { id: "all", label: arg.strings.showAll },
        { id: "evaluated", label: arg.strings.showEvaluated },
        { id: "cited", label: arg.strings.showCited },
        { id: "mixed", label: arg.strings.showMixed },
        { id: "unevaluated", label: arg.strings.showUnevaluated },
      ],
      (id) => {
        showMode = id as ShowMode;
        render();
      },
    );
    select.title = arg.strings.show;
    showMount.replaceWith(select);
  }

  // Sort order (L5); not persisted, every window starts alphabetical. Uses the
  // custom dropdown because native <select> popups break in this window.
  const sortMount = byId("sort");
  if (sortMount) {
    const sort = buildScopeSelect(
      [
        { id: "alpha", label: arg.strings.sortAlpha },
        { id: "incoming", label: arg.strings.sortIncoming },
        { id: "outgoing", label: arg.strings.sortOutgoing },
        { id: "year", label: arg.strings.sortYear },
      ],
      (id) => {
        sortMode = id as SortMode;
        render();
      },
    );
    sort.title = arg.strings.sort;
    sortMount.replaceWith(sort);
  }

  // Expand acts on the visible rows only; collapse clears every row (L1).
  toggleAll?.addEventListener("click", () => {
    if (allOpen()) {
      openIds.clear();
      for (const row of rows) row.setOpen(false);
    } else {
      for (const row of rows) row.setOpen(true);
    }
    updateToggle();
  });

  // Scope switcher (N6): rebuild the list for the chosen library/collection.
  // Open rows stay open where the item still appears in the new scope.
  const scopeMount = byId("scope");
  if (scopeMount) {
    const scope = buildScopeSelect(arg.scopes, (id) => {
      const data = JSON.parse(arg.getScopedData(id)) as {
        nodes: ListNode[];
      };
      nodes = data.nodes;
      render();
    });
    scope.title = arg.strings.scope;
    scopeMount.appendChild(scope);
  }

  // Export (L7): the visible rows in their current order.
  const exportMount = byId("export");
  if (exportMount) {
    const menu = buildScopeSelect(
      [
        { id: "md", label: arg.strings.exportMd },
        { id: "csv", label: arg.strings.exportCsv },
      ],
      (id) => {
        const { items, refs } = listExportData(visible, nodes);
        arg.saveExport(
          window,
          `qualified-references.${id}`,
          id === "md"
            ? referencesMarkdown(items, refs, arg.strings)
            : referencesCsv(refs, arg.strings.stances),
        );
      },
      { label: arg.strings.export, alignRight: true },
    );
    exportMount.replaceWith(menu);
  }

  // Live refresh (G6/L8): same scope, search, filters and open rows.
  onViewDataChanged(() => {
    nodes = (JSON.parse(arg.getCurrentData()) as { nodes: ListNode[] }).nodes;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });
}

main();
