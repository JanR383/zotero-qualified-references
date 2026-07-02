import { config } from "../../package.json";
import { getLocaleID, getString } from "../utils/locale";
import { selectItemInPane } from "./navigation";
import { zReader } from "../utils/zoteroApis";
import { STANCE_GLYPH, STANCE_ORDER, stanceCssValue } from "./stanceMeta";
import { formatItem, paneFields } from "./itemFormat";
import { getIncoming, getLinks, makeLink, setLinks } from "./storage";
import { pickItems } from "./picker";
import type { IncomingLink, ReferenceLink, Stance } from "./types";

let registeredID: string | false = false;

// Live render contexts, keyed by the stable section body element. The section
// renders in several panes at once (library + reader; see ItemPaneManager
// tabType), so we track them all and refresh every visible one — a single
// "last render" would update the wrong (often invisible) pane.
const rendered = new Map<
  HTMLElement,
  { item: Zotero.Item; editable: boolean }
>();

/**
 * Wrap a (possibly async) event handler so rejections are logged instead of
 * surfacing as unhandled promise rejections.
 */
function catching<A extends unknown[]>(
  fn: (...args: A) => Promise<void> | void,
): (...args: A) => void {
  return (...args) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        result.catch((e) => ztoolkit.log("QRef: handler failed", e));
      }
    } catch (e) {
      ztoolkit.log("QRef: handler failed", e);
    }
  };
}

const STANCE_TIP: Record<Stance, Parameters<typeof getString>[0]> = {
  2: "stance-pp",
  1: "stance-p",
  0: "stance-0",
  [-1]: "stance-m",
  [-2]: "stance-mm",
};

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
      // Attachments (PDF/snapshot) have their own pane but references live on
      // the parent regular item — mirror the parent so the section shows the
      // same data as the main item (cf. readerHook.ts parent resolution).
      const target = resolveTargetItem(item);
      if (!target) {
        body.replaceChildren();
        rendered.delete(body);
        return;
      }
      rendered.set(body, { item: target, editable });
      renderSection(body, target, editable);
    },
  });
}

export function unregisterReferenceSection() {
  if (registeredID) {
    Zotero.ItemPaneManager.unregisterSection(registeredID);
    registeredID = false;
  }
  rendered.clear();
}

/**
 * Resolve the item that actually carries references: for an attachment, its
 * parent regular item; otherwise the item itself. Returns null for an
 * attachment without a regular parent (no valid reference carrier).
 */
function resolveTargetItem(item: Zotero.Item): Zotero.Item | null {
  if (item.isAttachment()) {
    const parent = item.parentItemID
      ? Zotero.Items.get(item.parentItemID)
      : false;
    return parent && parent.isRegularItem() ? parent : null;
  }
  return item;
}

/**
 * Re-render every currently displayed pane showing itemID (reader + library at
 * once). Disconnected bodies are pruned as we go.
 */
export function refreshSectionIfVisible(itemID: number): void {
  for (const [body, ctx] of rendered) {
    if (!body.isConnected) {
      rendered.delete(body);
      continue;
    }
    if (ctx.item.id === itemID) renderSection(body, ctx.item, ctx.editable);
  }
}

/**
 * Re-render every currently displayed pane regardless of item — used when a
 * preference that changes how the section renders (e.g. the stance-control
 * style) is toggled, so the change is reflected without reopening the pane.
 */
export function refreshAllSections(): void {
  for (const [body, ctx] of rendered) {
    if (!body.isConnected) {
      rendered.delete(body);
      continue;
    }
    renderSection(body, ctx.item, ctx.editable);
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
    add.addEventListener(
      "click",
      catching(async () => {
        const win = doc.defaultView as Window;
        const ids = pickItems(win).filter((id) => id !== item.id);
        if (ids.length === 0) return;
        for (const id of ids) {
          const target = Zotero.Items.get(id);
          if (target) links.push(makeLink(target.key, target.libraryID));
        }
        await setLinks(item, links);
        rerender();
      }),
    );
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
  // Stack the parts vertically so the stance sits on its own line directly under
  // the referenced title, instead of flowing inline next to it.
  row.style.display = "flex";
  row.style.flexDirection = "column";
  row.style.alignItems = "flex-start";
  row.style.gap = "4px";

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

  const fieldsRow = doc.createElement("div");
  fieldsRow.style.display = "flex";
  fieldsRow.style.flexWrap = "wrap";
  fieldsRow.style.gap = "12px";
  fieldsRow.appendChild(
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
  fieldsRow.appendChild(
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
  row.appendChild(fieldsRow);

  const comment = doc.createElement("textarea");
  comment.value = link.comment || "";
  comment.rows = 2;
  comment.placeholder = getString("field-comment");
  comment.style.width = "100%";
  comment.disabled = !editable;
  comment.addEventListener(
    "change",
    catching(async () => {
      link.comment = comment.value || undefined;
      await save();
    }),
  );
  row.appendChild(comment);

  const anchor = sourceAnchorLink(doc, link, source.libraryID);
  if (anchor) {
    const anchorRow = doc.createElement("div");
    anchorRow.appendChild(anchor);
    row.appendChild(anchorRow);
  }

  if (editable) {
    const del = button(doc, getString("delete-button"));
    del.addEventListener(
      "click",
      catching(async () => {
        const idx = links.findIndex((l) => l.id === link.id);
        if (idx >= 0) links.splice(idx, 1);
        await setLinks(source, links);
        rerender();
      }),
    );
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
      selectItemInPane(item.id);
    });
  }
  return el;
}

/** Foreground (text) colour for stance badges/buttons; flips per theme. */
const STANCE_FG = "var(--qref-stance-fg)";

/** Read-only coloured badge showing the active stance (used in incoming rows). */
function stanceBadge(doc: Document, value: Stance): HTMLElement {
  const el = doc.createElement("span");
  el.textContent = STANCE_GLYPH[value];
  el.title = getString(STANCE_TIP[value]);
  el.style.display = "inline-block";
  el.style.padding = "1px 7px";
  el.style.borderRadius = "10px";
  el.style.fontSize = "0.85em";
  el.style.fontWeight = "bold";
  el.style.background = stanceCssValue(value);
  el.style.color = STANCE_FG;
  return el;
}

/** Stance setter. Style follows the `stanceControlCompact` preference. */
function stanceControl(
  doc: Document,
  current: Stance,
  editable: boolean,
  onPick: (value: Stance) => void,
): HTMLElement {
  const compact =
    Zotero.Prefs.get(`${config.prefsPrefix}.stanceControlCompact`, true) ===
    true;
  return compact
    ? stanceCompact(doc, current, editable, onPick)
    : stanceSegmented(doc, current, editable, onPick);
}

/**
 * Segmented spectrum control (default): the five stances as one connected,
 * pill-shaped scale. At rest the cells are neutral; only the selected cell
 * carries its stance colour, so the active value reads at a glance without the
 * busy "dimmed rainbow" of fully-tinted buttons.
 */
function stanceSegmented(
  doc: Document,
  current: Stance,
  editable: boolean,
  onPick: (value: Stance) => void,
): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.style.display = "inline-flex";
  wrap.style.borderRadius = "999px";
  wrap.style.overflow = "hidden";
  wrap.style.border =
    "0.5px solid var(--material-border-quarternary, rgba(0,0,0,.25))";
  wrap.style.fontSize = "0.85em";
  STANCE_ORDER.forEach((value, i) => {
    const b = doc.createElement("button");
    b.textContent = STANCE_GLYPH[value];
    b.title = getString(STANCE_TIP[value]);
    b.disabled = !editable;
    const active = value === current;
    b.setAttribute("aria-label", getString(STANCE_TIP[value]));
    b.setAttribute("aria-pressed", String(active));
    b.style.appearance = "none";
    b.style.minWidth = "26px";
    b.style.padding = "3px 9px";
    b.style.border = "none";
    if (i < STANCE_ORDER.length - 1) {
      b.style.borderRight =
        "0.5px solid var(--material-border-quarternary, rgba(0,0,0,.15))";
    }
    b.style.background = active ? stanceCssValue(value) : "transparent";
    b.style.color = active ? STANCE_FG : "var(--fill-secondary, #888)";
    b.style.fontWeight = active ? "bold" : "normal";
    b.style.cursor = editable ? "pointer" : "default";
    b.addEventListener(
      "click",
      catching(() => onPick(value)),
    );
    wrap.appendChild(b);
  });
  return wrap;
}

/** A round, stance-coloured pill (shared by the compact control + its menu). */
function stancePillButton(doc: Document, value: Stance): HTMLButtonElement {
  const b = doc.createElement("button");
  b.style.appearance = "none";
  b.style.border = "none";
  b.style.borderRadius = "999px";
  b.style.padding = "3px 10px";
  b.style.fontSize = "0.85em";
  b.style.background = stanceCssValue(value);
  b.style.color = STANCE_FG;
  return b;
}

/**
 * Compact control (opt-in via `stanceControlCompact`): show only the current
 * stance as a single pill (matching the read-only stanceBadge); clicking opens
 * a small menu of the five stances with their plain-language labels.
 */
function stanceCompact(
  doc: Document,
  current: Stance,
  editable: boolean,
  onPick: (value: Stance) => void,
): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.style.position = "relative";
  wrap.style.display = "inline-block";

  const trigger = stancePillButton(doc, current);
  trigger.title = getString(STANCE_TIP[current]);
  trigger.style.fontWeight = "bold";
  trigger.style.cursor = editable ? "pointer" : "default";
  trigger.textContent = `${STANCE_GLYPH[current]}  ${getString(STANCE_TIP[current])}`;
  wrap.appendChild(trigger);

  // Read-only items (e.g. another member's group item): show just the pill.
  if (!editable) {
    trigger.disabled = true;
    return wrap;
  }
  trigger.append(` ▾`);

  const menu = doc.createElement("div");
  menu.style.display = "none";
  menu.style.position = "absolute";
  menu.style.top = "100%";
  menu.style.left = "0";
  menu.style.marginTop = "4px";
  menu.style.zIndex = "10";
  menu.style.minWidth = "180px";
  menu.style.background = "var(--material-menu, Canvas)";
  menu.style.color = "var(--fill-primary, CanvasText)";
  menu.style.border =
    "0.5px solid var(--material-border-quarternary, rgba(0,0,0,.3))";
  menu.style.borderRadius = "6px";
  menu.style.overflow = "hidden";
  menu.style.fontSize = "0.9em";

  const onDocClick = (e: Event): void => {
    if (!wrap.contains(e.target as Node)) close();
  };
  function close(): void {
    menu.style.display = "none";
    doc.removeEventListener("click", onDocClick);
  }

  for (const value of STANCE_ORDER) {
    // A real <button> per row so the menu is keyboard-operable (Tab/Enter);
    // styles reset to look like a plain menu row.
    const row = doc.createElement("button");
    row.style.appearance = "none";
    row.style.border = "none";
    row.style.background = "transparent";
    row.style.font = "inherit";
    row.style.color = "inherit";
    row.style.width = "100%";
    row.style.textAlign = "left";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.padding = "4px 10px";
    row.style.cursor = "pointer";
    if (value === current) row.style.background = "var(--fill-quinary, #0001)";

    const dot = doc.createElement("span");
    dot.textContent = STANCE_GLYPH[value];
    dot.style.display = "inline-block";
    dot.style.minWidth = "20px";
    dot.style.textAlign = "center";
    dot.style.borderRadius = "6px";
    dot.style.padding = "0 4px";
    dot.style.background = stanceCssValue(value);
    dot.style.color = STANCE_FG;
    dot.style.fontWeight = "bold";

    const label = doc.createElement("span");
    label.textContent = getString(STANCE_TIP[value]);

    row.append(dot, label);
    row.addEventListener(
      "click",
      catching((e: Event) => {
        e.stopPropagation();
        close();
        onPick(value);
      }),
    );
    menu.appendChild(row);
  }

  trigger.addEventListener(
    "click",
    catching((e: Event) => {
      e.stopPropagation();
      const open = menu.style.display !== "none";
      if (open) {
        close();
      } else {
        menu.style.display = "block";
        doc.addEventListener("click", onDocClick);
      }
    }),
  );
  // Escape closes the menu and returns focus to the trigger.
  wrap.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && menu.style.display !== "none") {
      close();
      trigger.focus();
    }
  });

  wrap.appendChild(menu);
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
  const span = doc.createElement("span");
  span.textContent = getString(labelKey);
  span.style.fontSize = "0.9em";
  const input = doc.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.size = 6;
  input.disabled = !editable;
  input.addEventListener(
    "change",
    catching(() => onChange(input.value.trim())),
  );
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
    void zReader().open(att.id, { annotationID: annKey });
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
  a.addEventListener(
    "click",
    catching((e: Event) => {
      e.preventDefault();
      onClick();
    }),
  );
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
