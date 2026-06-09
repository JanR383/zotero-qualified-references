/**
 * Standalone renderer for the reference-list window (N3). Bundled separately
 * (see zotero-plugin.config.ts) and loaded as a classic <script> by
 * addon/content/list.xhtml. Reads its data from `window.arguments[0]`.
 *
 * Plain HTML/CSS (no third-party lib). Stance colours come from qref.css
 * (+ the palette override) via the --qref-stance-* custom properties, which
 * apply directly here since this is regular DOM (not canvas).
 */
import type { Stance } from "../modules/types";
import type { ListArg, ListEntry, ListNode } from "./types";

declare const window: Window & typeof globalThis & { arguments?: unknown[] };
declare const document: Document;

function create(tag: string): HTMLElement {
  return document.createElement(tag) as unknown as HTMLElement;
}
function byId(id: string): HTMLElement | null {
  return document.getElementById(id) as HTMLElement | null;
}

const STANCE_VAR: Record<Stance, string> = {
  2: "--qref-stance-strong-pos",
  1: "--qref-stance-pos",
  0: "--qref-stance-neutral",
  [-1]: "--qref-stance-neg",
  [-2]: "--qref-stance-strong-neg",
};
const GLYPH: Record<Stance, string> = {
  2: "++",
  1: "+",
  0: "0",
  [-1]: "−",
  [-2]: "−−",
};

function stancePill(stance: Stance): HTMLElement {
  const pill = create("span");
  pill.className = "pill";
  pill.style.background = `var(${STANCE_VAR[stance]})`;
  pill.textContent = GLYPH[stance];
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
  caret.addEventListener("click", toggle);
  // Header click (outside the title) also toggles.
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

  if (arg.nodes.length === 0) {
    const empty = byId("empty");
    if (empty) {
      empty.textContent = arg.strings.empty;
      empty.style.display = "block";
    }
    return;
  }

  for (const node of arg.nodes) root.appendChild(nodeRow(node, arg));
}

main();
