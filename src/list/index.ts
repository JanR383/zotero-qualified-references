/**
 * Standalone renderer for the reference-list window (N3). Bundled separately
 * (see zotero-plugin.config.ts) and loaded as a classic <script> by
 * addon/content/list.xhtml. Reads its data from `window.arguments[0]`.
 *
 * Plain HTML/CSS (no third-party lib). Stance colours come from qref.css
 * (+ the palette override) via the --qref-stance-* custom properties, which
 * apply directly here since this is regular DOM (not canvas).
 */
import { STANCE_GLYPH, stanceCssValue } from "../modules/stanceMeta";
import { byId, create } from "../shared/dom";
import { buildScopeSelect } from "../shared/scopeSelect";
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

function nodeRow(node: ListNode, arg: ListArg): HTMLElement {
  const wrap = create("div");
  wrap.className = "node";

  const header = create("div");
  header.className = "node-head";

  const caret = create("span");
  caret.className = "caret";
  caret.textContent = "▸";

  const title = create("span");
  title.className = "node-title";
  const count = node.outgoing.length + node.incoming.length;
  title.textContent = `${node.label}  (${count})`;
  title.addEventListener("click", () => arg.selectItem(node.id));

  header.append(caret, title);
  wrap.appendChild(header);

  const body = create("div");
  body.className = "node-body";
  body.style.display = "none";
  const out = section(arg.strings.outgoing, "→", node.outgoing, arg.selectItem);
  const inc = section(arg.strings.incoming, "←", node.incoming, arg.selectItem);
  if (out) body.appendChild(out);
  if (inc) body.appendChild(inc);
  wrap.appendChild(body);

  const toggle = (): void => {
    const open = body.style.display !== "none";
    body.style.display = open ? "none" : "block";
    caret.textContent = open ? "▸" : "▾";
  };
  // Any header click outside the title toggles (this covers the caret too —
  // a separate caret listener would double-toggle via bubbling and cancel out).
  header.addEventListener("click", (e: Event) => {
    if (e.target !== title) toggle();
  });

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
  const renderNodes = (nodes: ListNode[]): void => {
    root.replaceChildren();
    if (empty) {
      empty.textContent = arg.strings.empty;
      empty.style.display = nodes.length === 0 ? "block" : "none";
    }
    for (const node of nodes) root.appendChild(nodeRow(node, arg));
  };
  renderNodes(arg.nodes);

  // Scope switcher (N6): rebuild the list for the chosen library/collection.
  const scopeMount = byId("scope");
  const scopeLabel = byId("scope-label");
  if (scopeMount) {
    if (scopeLabel) scopeLabel.textContent = arg.strings.scope;
    scopeMount.appendChild(
      buildScopeSelect(arg.scopes, (id) => {
        const data = JSON.parse(arg.getScopedData(id)) as {
          nodes: ListNode[];
        };
        renderNodes(data.nodes);
      }),
    );
  }
}

main();
