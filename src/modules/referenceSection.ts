import { config } from "../../package.json";
import { getLocaleID, getString } from "../utils/locale";
import { openAnnotation, selectItemInPane } from "./navigation";
import {
  STANCE_GLYPH,
  STANCE_LABEL_KEY,
  STANCE_ORDER,
  stanceCssValue,
} from "./stanceMeta";
import { formatItem, paneFields } from "./itemFormat";
import {
  addIncomingLinks,
  getIncoming,
  getLinks,
  makeLink,
  reportSaveError,
  updateLink,
  updateLinks,
} from "./storage";
import { pickItems, referenceTargets } from "./picker";
import {
  dismissRemoval,
  itemHistory,
  restoreEntry,
  wasRemovedExternally,
} from "./history";
import type { JournalEntry } from "./journalLogic";
import type { IncomingLink, ReferenceLink, Stance } from "./types";
import { log, showNotice } from "../utils/log";

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
/**
 * Maximum length of a reference comment typed in the pane (S1), from the
 * settings. Clamped so a stray value cannot disable the limit or make the
 * field unusable; 10 000 is also the cap applied when reading.
 */
function commentMaxLength(): number {
  const v = Number(
    Zotero.Prefs.get(`${config.prefsPrefix}.commentMaxLength`, true),
  );
  return Number.isFinite(v) ? Math.min(10_000, Math.max(100, v)) : 2000;
}

function catching<A extends unknown[]>(
  fn: (...args: A) => Promise<void> | void,
): (...args: A) => void {
  return (...args) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        result.catch((e) => reportSaveError("QRef: handler failed", e));
      }
    } catch (e) {
      reportSaveError("QRef: handler failed", e);
    }
  };
}

export function registerReferenceSection() {
  registeredID = Zotero.ItemPaneManager.registerSection({
    paneID: "qref-section",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("section-head-text"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/qref.svg`,
    },
    sidenav: {
      l10nID: getLocaleID("section-sidenav-tooltip"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/qref.svg`,
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
 * Exported for tests.
 */
export function resolveTargetItem(item: Zotero.Item): Zotero.Item | null {
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

/** Render the section for `item` into `body`. Exported for tests. */
export function renderSection(
  body: HTMLElement,
  item: Zotero.Item,
  editable: boolean,
): void {
  const doc = body.ownerDocument!;
  body.replaceChildren();
  const rerender = () => renderSection(body, item, editable);
  const history = itemHistory(item);

  // Another tool removed this item's references (S5): offer them back.
  if (editable && wasRemovedExternally(item) && history.length > 0) {
    body.appendChild(removalBanner(doc, item, history[0], rerender));
  }

  // Outgoing references (editable)
  body.appendChild(heading(doc, getString("section-outgoing-title")));
  const links = getLinks(item);
  if (links.length === 0) {
    body.appendChild(muted(doc, getString("no-outgoing")));
  }
  for (const link of links) {
    const target = Zotero.Items.getByLibraryAndKey(
      link.targetLib,
      link.targetKey,
    );
    body.appendChild(linkRow(doc, item, link, target, editable, rerender));
  }
  if (editable) {
    const add = button(doc, getString("add-button-label"));
    add.addEventListener(
      "click",
      catching(async () => {
        const win = doc.defaultView as Window;
        const ids = referenceTargets(item, pickItems(win));
        if (ids.length === 0) return;
        await updateLinks(
          item,
          (current) => {
            for (const id of ids) {
              const target = Zotero.Items.get(id);
              if (target) current.push(makeLink(target.key, target.libraryID));
            }
          },
          { action: "add", count: ids.length },
        );
        rerender();
      }),
    );
    body.appendChild(add);
  }
  if (history.length > 0) {
    body.appendChild(historyList(doc, item, history, editable, rerender));
  }

  // Incoming references (read-only)
  body.appendChild(heading(doc, getString("section-incoming-title")));
  const incoming = getIncoming(item);
  const editIncoming =
    editable &&
    Zotero.Prefs.get(`${config.prefsPrefix}.editIncoming`, true) !== false;
  if (incoming.length === 0) {
    body.appendChild(muted(doc, getString("no-incoming")));
  }
  for (const inc of incoming) {
    // Editable in place when the item storing the reference can be saved;
    // otherwise the compact read-only view.
    const source = Zotero.Items.get(inc.sourceID);
    body.appendChild(
      editIncoming && source && source.isEditable()
        ? linkRow(doc, source, inc.link, source, true, rerender)
        : incomingRow(doc, inc),
    );
  }
  if (editIncoming) {
    // The reverse direction: the picked items reference this one. Each
    // reference is stored on (and saved to) the picked item.
    const addIncoming = button(doc, getString("add-incoming-button-label"));
    addIncoming.addEventListener(
      "click",
      catching(async () => {
        const win = doc.defaultView as Window;
        const ids = referenceTargets(item, pickItems(win));
        if (ids.length === 0) return;
        const result = await addIncomingLinks(item, ids);
        if (result.readOnly > 0) {
          showNotice(
            getString("add-incoming-read-only", {
              args: { count: result.readOnly },
            }),
            10_000,
          );
        }
        if (result.tooLarge > 0) {
          showNotice(getString("save-too-large"), 10_000);
        }
        rerender();
      }),
    );
    body.appendChild(addIncoming);
  }
}

/**
 * Editor for one reference stored on `source`. `shown` is the item named in
 * the row: the target for an outgoing reference, the source for an incoming
 * one (false when it no longer exists).
 */
function linkRow(
  doc: Document,
  source: Zotero.Item,
  link: ReferenceLink,
  shown: Zotero.Item | false,
  editable: boolean,
  rerender: () => void,
): HTMLElement {
  // The parts stack vertically so the stance sits on its own line directly
  // under the referenced title, instead of flowing inline next to it.
  const row = box(doc, "qref-outgoing");

  row.appendChild(
    titleLink(
      doc,
      shown ? formatItem(shown, paneFields()) : getString("missing-item"),
      shown || undefined,
    ),
  );

  // Every edit patches this link by id on the item's current links (not the
  // array captured at render time), so concurrent changes are not lost.
  const save = (patch: Partial<Omit<ReferenceLink, "id">>) =>
    updateLink(source, link.id, patch);

  row.appendChild(
    stanceControl(doc, link.stance, editable, async (value) => {
      await save({ stance: value });
      rerender();
    }),
  );

  const fieldsRow = el(doc, "div", "qref-fields");
  fieldsRow.appendChild(
    pageField(
      doc,
      "field-source-pages",
      link.sourcePages,
      editable,
      async (v) => {
        await save({ sourcePages: v || undefined });
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
        await save({ targetPages: v || undefined });
      },
    ),
  );
  row.appendChild(fieldsRow);

  const comment = doc.createElement("textarea");
  comment.value = link.comment || "";
  comment.rows = 2;
  comment.placeholder = getString("field-comment");
  comment.className = "qref-comment";
  // Keeps one item's references well inside the sync size limit (S1); longer
  // comments saved before stay as they are.
  comment.maxLength = commentMaxLength();
  comment.disabled = !editable;
  comment.addEventListener(
    "change",
    catching(async () => {
      await save({ comment: comment.value || undefined });
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
        await updateLinks(
          source,
          (current) => {
            const idx = current.findIndex((l) => l.id === link.id);
            if (idx >= 0) current.splice(idx, 1);
          },
          { action: "delete" },
        );
        rerender();
      }),
    );
    row.appendChild(del);
  }

  return row;
}

// --- Earlier states (S4) and foreign removals (S5) ----------------------------

function removalBanner(
  doc: Document,
  item: Zotero.Item,
  latest: JournalEntry,
  rerender: () => void,
): HTMLElement {
  const banner = el(doc, "div", "qref-banner");
  const text = doc.createElement("div");
  text.textContent = getString("journal-banner", {
    args: { count: latest.count },
  });
  const restore = button(doc, getString("journal-restore"));
  restore.addEventListener(
    "click",
    catching(async () => {
      await restoreEntry(item, latest);
      rerender();
    }),
  );
  const dismiss = button(doc, getString("journal-dismiss"));
  dismiss.addEventListener("click", () => {
    dismissRemoval(item);
    rerender();
  });
  banner.append(text, restore, dismiss);
  return banner;
}

/** Collapsed list of the item's earlier states from the local journal. */
function historyList(
  doc: Document,
  item: Zotero.Item,
  history: JournalEntry[],
  editable: boolean,
  rerender: () => void,
): HTMLElement {
  const details = el(doc, "details", "qref-history");
  const summary = doc.createElement("summary");
  summary.textContent = getString("journal-title", {
    args: { count: history.length },
  });
  details.appendChild(summary);
  details.appendChild(muted(doc, getString("journal-desc")));
  for (const entry of history) {
    const row = el(doc, "div", "qref-history-row");
    const label = doc.createElement("span");
    label.textContent = getString("journal-entry", {
      args: {
        time: new Date(entry.time).toLocaleString(),
        count: entry.count,
      },
    });
    row.appendChild(label);
    if (editable) {
      const restore = button(doc, getString("journal-restore"));
      restore.addEventListener(
        "click",
        catching(async () => {
          await restoreEntry(item, entry);
          rerender();
        }),
      );
      row.appendChild(restore);
    }
    details.appendChild(row);
  }
  return details;
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

  const metaWrap = el(doc, "div", "qref-meta");
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
    const c = el(doc, "div", "qref-comment-text");
    c.textContent = inc.link.comment;
    row.appendChild(c);
  }
  return row;
}

// --- Small DOM helpers ------------------------------------------------------

// Styling lives in addon/content/qref.css (the `qref-*` classes), which
// hooks.ts links into the main window, where the item pane is rendered.

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = className;
  return e;
}

function box(doc: Document, extraClass?: string): HTMLElement {
  return el(doc, "div", extraClass ? `qref-row ${extraClass}` : "qref-row");
}

function heading(doc: Document, text: string): HTMLElement {
  const h = el(doc, "h2", "qref-heading");
  h.textContent = text;
  return h;
}

function muted(doc: Document, text: string): HTMLElement {
  const m = el(doc, "div", "qref-muted");
  m.textContent = text;
  return m;
}

function button(doc: Document, label: string): HTMLButtonElement {
  const b = el(doc, "button", "qref-button");
  b.textContent = label;
  return b;
}

function titleLink(
  doc: Document,
  text: string,
  item?: Zotero.Item,
): HTMLElement {
  const t = el(doc, item ? "a" : "span", "qref-title");
  t.textContent = text;
  if (item) {
    t.setAttribute("href", "#");
    t.addEventListener("click", (e: Event) => {
      e.preventDefault();
      selectItemInPane(item.id);
    });
  }
  return t;
}

/** Read-only coloured badge showing the active stance (used in incoming rows). */
function stanceBadge(doc: Document, value: Stance): HTMLElement {
  const badge = el(doc, "span", "qref-stance-badge");
  badge.textContent = STANCE_GLYPH[value];
  badge.title = getString(STANCE_LABEL_KEY[value]);
  badge.style.background = stanceCssValue(value);
  return badge;
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
  const wrap = el(doc, "div", "qref-stance-scale");
  for (const value of STANCE_ORDER) {
    const b = el(doc, "button", "qref-stance-cell");
    b.textContent = STANCE_GLYPH[value];
    b.title = getString(STANCE_LABEL_KEY[value]);
    b.disabled = !editable;
    const active = value === current;
    b.setAttribute("aria-label", getString(STANCE_LABEL_KEY[value]));
    b.setAttribute("aria-pressed", String(active));
    if (active) {
      b.classList.add("qref-active");
      b.style.background = stanceCssValue(value);
    }
    b.addEventListener(
      "click",
      catching(() => onPick(value)),
    );
    wrap.appendChild(b);
  }
  return wrap;
}

/** A round, stance-coloured pill (shared by the compact control + its menu). */
function stancePillButton(doc: Document, value: Stance): HTMLButtonElement {
  const b = el(doc, "button", "qref-stance-pill");
  b.style.background = stanceCssValue(value);
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
  const wrap = el(doc, "div", "qref-stance-compact");

  const trigger = stancePillButton(doc, current);
  trigger.title = getString(STANCE_LABEL_KEY[current]);
  trigger.textContent = `${STANCE_GLYPH[current]}  ${getString(STANCE_LABEL_KEY[current])}`;
  wrap.appendChild(trigger);

  // Read-only items (e.g. another member's group item): show just the pill.
  if (!editable) {
    trigger.disabled = true;
    return wrap;
  }
  trigger.append(` ▾`);

  const menu = el(doc, "div", "qref-stance-menu");
  const isOpen = () => menu.classList.contains("qref-open");

  const onDocClick = (e: Event): void => {
    if (!wrap.contains(e.target as Node)) close();
  };
  function close(): void {
    menu.classList.remove("qref-open");
    doc.removeEventListener("click", onDocClick);
  }

  for (const value of STANCE_ORDER) {
    // A real <button> per row so the menu is keyboard-operable (Tab/Enter);
    // styles reset to look like a plain menu row.
    const row = el(doc, "button", "qref-stance-option");
    if (value === current) row.classList.add("qref-current");

    const dot = el(doc, "span", "qref-stance-dot");
    dot.textContent = STANCE_GLYPH[value];
    dot.style.background = stanceCssValue(value);

    const label = doc.createElement("span");
    label.textContent = getString(STANCE_LABEL_KEY[value]);

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
      if (isOpen()) {
        close();
      } else {
        menu.classList.add("qref-open");
        doc.addEventListener("click", onDocClick);
      }
    }),
  );
  // Escape closes the menu and returns focus to the trigger.
  wrap.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen()) {
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
  const wrap = el(doc, "label", "qref-page-field");
  const span = doc.createElement("span");
  span.textContent = getString(labelKey);
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

function linkButton(
  doc: Document,
  text: string,
  onClick: () => void,
): HTMLElement {
  const a = el(doc, "a", "qref-link");
  a.textContent = text;
  a.setAttribute("href", "#");
  a.addEventListener(
    "click",
    catching((e: Event) => {
      e.preventDefault();
      onClick();
    }),
  );
  return a;
}

/**
 * "↗ open in A's PDF" link for a stored source anchor (or null if none). When
 * the highlight or its PDF has been deleted, a muted note replaces the link,
 * which would otherwise do nothing.
 */
function sourceAnchorLink(
  doc: Document,
  link: ReferenceLink,
  sourceLib: number,
): HTMLElement | null {
  if (!link.sourceAnnotationKey || !link.sourceAttachmentKey) return null;
  if (!anchorExists(sourceLib, link)) {
    return muted(doc, getString("anchor-missing"));
  }
  return linkButton(doc, getString("anchor-open"), () =>
    openAnnotation(
      sourceLib,
      link.sourceAttachmentKey!,
      link.sourceAnnotationKey!,
    ),
  );
}

function anchorExists(lib: number, link: ReferenceLink): boolean {
  // Deleting an annotation erases it (annotations have no trash), so a
  // missing key is what a deleted highlight looks like.
  return [link.sourceAttachmentKey!, link.sourceAnnotationKey!].every(
    (key) => !!Zotero.Items.getIDFromLibraryAndKey(lib, key),
  );
}
