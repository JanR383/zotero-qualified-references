import { getLocaleID, getString } from "../utils/locale";
import { formatItem, paneFields } from "./itemFormat";
import { getIncoming, getLinks, makeLink, setLinks } from "./storage";
import { pickItems } from "./picker";
import type { IncomingLink, ReferenceLink, Stance } from "./types";

let registeredID: string | false = false;

const STANCES: {
  value: Stance;
  glyph: string;
  tip: Parameters<typeof getString>[0];
}[] = [
  { value: 2, glyph: "++", tip: "stance-pp" },
  { value: 1, glyph: "+", tip: "stance-p" },
  { value: 0, glyph: "0", tip: "stance-0" },
  { value: -1, glyph: "−", tip: "stance-m" },
  { value: -2, glyph: "−−", tip: "stance-mm" },
];

export function registerReferenceSection() {
  registeredID = Zotero.ItemPaneManager.registerSection({
    paneID: "qref-section",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("section-head-text"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/book-open.svg`,
    },
    sidenav: {
      l10nID: getLocaleID("section-sidenav-tooltip"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/book-open.svg`,
    },
    onRender: ({ body, item, editable }) => {
      if (!item) return;
      renderSection(body, item, editable);
    },
  });
}

export function unregisterReferenceSection() {
  if (registeredID) {
    Zotero.ItemPaneManager.unregisterSection(registeredID);
    registeredID = false;
  }
}

// --- Rendering --------------------------------------------------------------

function renderSection(
  body: HTMLElement,
  item: Zotero.Item,
  editable: boolean,
): void {
  const doc = body.ownerDocument!;
  body.replaceChildren();
  const rerender = () => renderSection(body, item, editable);

  // Outgoing references (editable)
  body.appendChild(heading(doc, getString("section-outgoing-title")));
  const links = getLinks(item);
  if (links.length === 0) {
    body.appendChild(muted(doc, getString("no-outgoing")));
  }
  for (const link of links) {
    body.appendChild(outgoingRow(doc, item, link, links, editable, rerender));
  }
  if (editable) {
    const add = button(doc, getString("add-button-label"));
    add.addEventListener("click", async () => {
      const win = doc.defaultView as Window;
      const ids = pickItems(win).filter((id) => id !== item.id);
      if (ids.length === 0) return;
      for (const id of ids) {
        const target = Zotero.Items.get(id);
        if (target) links.push(makeLink(target.key, target.libraryID));
      }
      await setLinks(item, links);
      rerender();
    });
    body.appendChild(add);
  }

  // Incoming references (read-only)
  body.appendChild(heading(doc, getString("section-incoming-title")));
  const incoming = getIncoming(item);
  if (incoming.length === 0) {
    body.appendChild(muted(doc, getString("no-incoming")));
  }
  for (const inc of incoming) {
    body.appendChild(incomingRow(doc, inc));
  }
}

function outgoingRow(
  doc: Document,
  source: Zotero.Item,
  link: ReferenceLink,
  links: ReferenceLink[],
  editable: boolean,
  rerender: () => void,
): HTMLElement {
  const row = box(doc);

  const target = Zotero.Items.getByLibraryAndKey(
    link.targetLib,
    link.targetKey,
  );
  row.appendChild(
    titleLink(
      doc,
      target ? formatItem(target, paneFields()) : getString("missing-item"),
      target || undefined,
    ),
  );

  const save = async () => {
    link.modified = new Date().toISOString();
    await setLinks(source, links);
  };

  row.appendChild(
    stanceControl(doc, link.stance, editable, async (value) => {
      link.stance = value;
      await save();
      rerender();
    }),
  );

  row.appendChild(
    pageField(
      doc,
      "field-source-pages",
      link.sourcePages,
      editable,
      async (v) => {
        link.sourcePages = v || undefined;
        await save();
      },
    ),
  );
  row.appendChild(
    pageField(
      doc,
      "field-target-pages",
      link.targetPages,
      editable,
      async (v) => {
        link.targetPages = v || undefined;
        await save();
      },
    ),
  );

  const comment = doc.createElement("textarea");
  comment.value = link.comment || "";
  comment.rows = 2;
  comment.placeholder = getString("field-comment");
  comment.style.width = "100%";
  comment.style.marginTop = "4px";
  comment.disabled = !editable;
  comment.addEventListener("change", async () => {
    link.comment = comment.value || undefined;
    await save();
  });
  row.appendChild(comment);

  const anchor = sourceAnchorLink(doc, link, source.libraryID);
  if (anchor) {
    const anchorRow = doc.createElement("div");
    anchorRow.style.margin = "4px 0";
    anchorRow.appendChild(anchor);
    row.appendChild(anchorRow);
  }

  if (editable) {
    const del = button(doc, getString("delete-button"));
    del.addEventListener("click", async () => {
      const idx = links.findIndex((l) => l.id === link.id);
      if (idx >= 0) links.splice(idx, 1);
      await setLinks(source, links);
      rerender();
    });
    row.appendChild(del);
  }

  return row;
}

function incomingRow(doc: Document, inc: IncomingLink): HTMLElement {
  const row = box(doc);
  const source = Zotero.Items.get(inc.sourceID);
  row.appendChild(
    titleLink(
      doc,
      source ? formatItem(source, paneFields()) : getString("missing-item"),
      source || undefined,
    ),
  );

  const metaWrap = doc.createElement("div");
  metaWrap.style.display = "flex";
  metaWrap.style.alignItems = "center";
  metaWrap.style.gap = "8px";
  metaWrap.style.margin = "4px 0";
  metaWrap.appendChild(stanceBadge(doc, inc.link.stance));
  const pages: string[] = [];
  if (inc.link.sourcePages)
    pages.push(`${getString("field-source-pages")}: ${inc.link.sourcePages}`);
  if (inc.link.targetPages)
    pages.push(`${getString("field-target-pages")}: ${inc.link.targetPages}`);
  if (pages.length > 0) metaWrap.appendChild(muted(doc, pages.join("  ·  ")));
  const inAnchor = sourceAnchorLink(doc, inc.link, inc.sourceLib);
  if (inAnchor) metaWrap.appendChild(inAnchor);
  row.appendChild(metaWrap);

  if (inc.link.comment) {
    const c = doc.createElement("div");
    c.textContent = inc.link.comment;
    c.style.whiteSpace = "pre-wrap";
    row.appendChild(c);
  }
  return row;
}

// --- Small DOM helpers ------------------------------------------------------

function box(doc: Document): HTMLElement {
  const el = doc.createElement("div");
  el.style.padding = "6px 0";
  el.style.borderBottom = "1px solid var(--material-border-quarternary, #ddd)";
  return el;
}

function heading(doc: Document, text: string): HTMLElement {
  const el = doc.createElement("h2");
  el.textContent = text;
  el.style.margin = "8px 0 4px";
  el.style.fontSize = "1em";
  return el;
}

function muted(doc: Document, text: string): HTMLElement {
  const el = doc.createElement("div");
  el.textContent = text;
  el.style.color = "var(--fill-secondary, #888)";
  el.style.fontSize = "0.9em";
  return el;
}

function button(doc: Document, label: string): HTMLButtonElement {
  const el = doc.createElement("button");
  el.textContent = label;
  el.style.marginTop = "6px";
  return el;
}

function titleLink(
  doc: Document,
  text: string,
  item?: Zotero.Item,
): HTMLElement {
  const el = doc.createElement(item ? "a" : "span");
  el.textContent = text;
  el.style.fontWeight = "bold";
  if (item) {
    (el as HTMLElement).style.cursor = "pointer";
    el.setAttribute("href", "#");
    el.addEventListener("click", (e: Event) => {
      e.preventDefault();
      Zotero.getActiveZoteroPane()?.selectItem(item.id);
    });
  }
  return el;
}

/**
 * Background colour for each stance value. Values are CSS custom properties
 * defined in addon/content/qref.css and overridden under
 * prefers-color-scheme: dark, so badges/buttons adapt to the Zotero theme.
 */
const STANCE_COLOR: Record<Stance, string> = {
  2: "var(--qref-stance-strong-pos)", // ++
  1: "var(--qref-stance-pos)", // +
  0: "var(--qref-stance-neutral)", // 0
  [-1]: "var(--qref-stance-neg)", // −
  [-2]: "var(--qref-stance-strong-neg)", // −−
};

/** Foreground (text) colour for stance badges/buttons; flips per theme. */
const STANCE_FG = "var(--qref-stance-fg)";

function stanceGlyph(value: Stance): string {
  return STANCES.find((s) => s.value === value)?.glyph ?? "0";
}

/** Read-only coloured badge showing the active stance (used in incoming rows). */
function stanceBadge(doc: Document, value: Stance): HTMLElement {
  const s = STANCES.find((s) => s.value === value) ?? STANCES[2];
  const el = doc.createElement("span");
  el.textContent = s.glyph;
  el.title = getString(s.tip);
  el.style.display = "inline-block";
  el.style.padding = "1px 7px";
  el.style.borderRadius = "10px";
  el.style.fontSize = "0.85em";
  el.style.fontWeight = "bold";
  el.style.background = STANCE_COLOR[value] ?? STANCE_COLOR[0];
  el.style.color = STANCE_FG;
  return el;
}

function stanceControl(
  doc: Document,
  current: Stance,
  editable: boolean,
  onPick: (value: Stance) => void,
): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.style.display = "inline-flex";
  wrap.style.gap = "2px";
  wrap.style.margin = "4px 0";
  for (const s of STANCES) {
    const b = doc.createElement("button");
    b.textContent = s.glyph;
    b.title = getString(s.tip);
    b.disabled = !editable;
    b.style.minWidth = "28px";
    // Tint every button with its stance colour so the whole scale (green→red)
    // is readable at a glance. The active one is emphasised (full opacity +
    // bold + ring); the rest are dimmed but keep their hue, instead of being
    // left uncoloured (white), which hid the colour coding until selection.
    const active = s.value === current;
    b.style.background = STANCE_COLOR[s.value];
    b.style.color = STANCE_FG;
    b.style.fontWeight = active ? "bold" : "normal";
    b.style.opacity = active ? "1" : "0.4";
    if (active) b.style.boxShadow = `inset 0 0 0 2px ${STANCE_FG}`;
    b.addEventListener("click", () => onPick(s.value));
    wrap.appendChild(b);
  }
  return wrap;
}

function pageField(
  doc: Document,
  labelKey: Parameters<typeof getString>[0],
  value: string | undefined,
  editable: boolean,
  onChange: (value: string) => void,
): HTMLElement {
  const wrap = doc.createElement("label");
  wrap.style.display = "inline-flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "4px";
  wrap.style.marginRight = "10px";
  const span = doc.createElement("span");
  span.textContent = getString(labelKey);
  span.style.fontSize = "0.9em";
  const input = doc.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.size = 6;
  input.disabled = !editable;
  input.addEventListener("change", () => onChange(input.value.trim()));
  wrap.append(span, input);
  return wrap;
}

// --- PDF anchor (M6) ---------------------------------------------------------
// A reference may carry an anchor to the passage in the SOURCE item's PDF that
// cites the target. The anchor is created from the reader's annotation context
// menu (see src/modules/readerHook.ts); here we only render a jump link that
// opens that PDF at the annotation via
//   Zotero.Reader.open(attachmentID, { annotationID: key })
// — the same `location` Zotero's `zotero://open-pdf` handler builds.

function openAnnotation(lib: number, attKey: string, annKey: string): void {
  const att = Zotero.Items.getByLibraryAndKey(lib, attKey);
  if (!att) return;
  try {
    void (Zotero as any).Reader.open(att.id, { annotationID: annKey });
  } catch (e) {
    ztoolkit.log("QRef: failed to open annotation", e);
  }
}

function linkButton(
  doc: Document,
  text: string,
  onClick: () => void,
): HTMLElement {
  const a = doc.createElement("a");
  a.textContent = text;
  a.setAttribute("href", "#");
  a.style.cursor = "pointer";
  a.style.fontSize = "0.9em";
  a.addEventListener("click", (e: Event) => {
    e.preventDefault();
    onClick();
  });
  return a;
}

/** "↗ open in A's PDF" link for a stored source anchor (or null if none). */
function sourceAnchorLink(
  doc: Document,
  link: ReferenceLink,
  sourceLib: number,
): HTMLElement | null {
  if (!link.sourceAnnotationKey || !link.sourceAttachmentKey) return null;
  return linkButton(doc, getString("anchor-open"), () =>
    openAnnotation(
      sourceLib,
      link.sourceAttachmentKey!,
      link.sourceAnnotationKey!,
    ),
  );
}
