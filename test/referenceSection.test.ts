import { assert } from "chai";
import { config } from "../package.json";
import {
  renderSection,
  resolveTargetItem,
} from "../src/modules/referenceSection";
import { saveSelectionHighlight } from "../src/modules/readerHook";
import { getLinks, makeLink, setLinks } from "../src/modules/storage";
import { getString } from "../src/utils/locale";
import {
  eraseItems,
  makeBody,
  makeItem,
  makePdfAttachment,
  waitFor,
  wirePluginGlobals,
} from "./helpers";

/**
 * Integration tests for the item-pane section, rendered into a detached element
 * of the main window's document. Edits go through the real DOM event handlers
 * and are checked against the stored references. The "Add" button is not
 * covered: it opens Zotero's modal item picker.
 */
const COMPACT_PREF = `${config.prefsPrefix}.stanceControlCompact`;

describe("referenceSection", function () {
  let lib: number;
  let source: Zotero.Item;
  let target: Zotero.Item;
  let created: Array<Zotero.Item | undefined>;
  let compactBefore: unknown;

  before(function () {
    wirePluginGlobals();
    lib = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    compactBefore = Zotero.Prefs.get(COMPACT_PREF, true);
    Zotero.Prefs.set(COMPACT_PREF, false, true);
    source = await makeItem(lib, "QRef section source");
    target = await makeItem(lib, "QRef section target");
    created = [source, target];
  });

  afterEach(async function () {
    Zotero.Prefs.set(COMPACT_PREF, compactBefore as boolean, true);
    await eraseItems(created);
  });

  function fire(el: Element, type: string): void {
    const win = el.ownerDocument!.defaultView!;
    el.dispatchEvent(new win.Event(type, { bubbles: true }));
  }

  const buttons = (body: HTMLElement, label: string) =>
    (Array.from(body.querySelectorAll("button")) as HTMLButtonElement[]).filter(
      (b) => b.textContent === label,
    );

  async function render(editable = true): Promise<HTMLElement> {
    const body = makeBody();
    renderSection(body, source, editable);
    return body;
  }

  async function withOneLink(
    patch: Partial<ReturnType<typeof makeLink>> = {},
  ): Promise<void> {
    await setLinks(source, [{ ...makeLink(target.key, lib, 1), ...patch }]);
  }

  it("shows empty states without references", async function () {
    const body = await render();
    assert.include(body.textContent, getString("no-outgoing"));
    assert.include(body.textContent, getString("no-incoming"));
  });

  it("shows an outgoing link and marks an unresolvable target", async function () {
    await setLinks(source, [
      makeLink(target.key, lib, 1),
      makeLink("ZZZZZZZZ", lib, 0),
    ]);
    const body = await render();
    assert.notInclude(body.textContent, getString("no-outgoing"));
    assert.include(body.textContent, "QRef section target");
    assert.include(body.textContent, getString("missing-item"));
    assert.lengthOf(buttons(body, getString("delete-button")), 2);
  });

  async function renderTargetIndexed(editable: boolean): Promise<HTMLElement> {
    await waitFor(() => {
      const b = makeBody();
      renderSection(b, target, editable);
      return !b.textContent!.includes(getString("no-incoming"));
    }, "incoming reference indexed");
    const body = makeBody();
    renderSection(body, target, editable);
    return body;
  }

  it("lists incoming references on the target", async function () {
    await withOneLink({ comment: "incoming comment", targetPages: "7" });
    const body = await renderTargetIndexed(false);
    assert.include(body.textContent, "QRef section source");
    assert.include(body.textContent, "incoming comment");
    assert.include(body.textContent, "7");
  });

  it("edits an incoming reference's stance and comment on its source", async function () {
    await withOneLink({ comment: "before" });
    const body = await renderTargetIndexed(true);
    assert.include(body.textContent, "QRef section source");
    const comment = body.querySelector("textarea")!;
    assert.equal(comment.value, "before");
    comment.value = "edited from the target";
    fire(comment, "change");
    await waitFor(
      () => getLinks(source)[0]?.comment === "edited from the target",
      "comment saved on the source",
    );
    (
      body.querySelector(
        `button[aria-label="${getString("stance-mm")}"]`,
      ) as HTMLButtonElement
    ).click();
    await waitFor(() => getLinks(source)[0]?.stance === -2, "stance saved");
    assert.deepEqual(getLinks(target), [], "nothing is stored on the target");
  });

  it("is read-only when not editable", async function () {
    await withOneLink();
    const body = await render(false);
    assert.lengthOf(buttons(body, getString("delete-button")), 0);
    assert.lengthOf(buttons(body, getString("add-button-label")), 0);
    for (const el of body.querySelectorAll("input, textarea, button")) {
      assert.isTrue(
        (el as HTMLInputElement).disabled,
        `${el.localName} is disabled`,
      );
    }
  });

  it("saves a picked stance", async function () {
    await withOneLink();
    const body = await render();
    const pick = body.querySelector(
      `button[aria-label="${getString("stance-mm")}"]`,
    ) as HTMLButtonElement;
    assert.ok(pick, "segmented stance button rendered");
    assert.equal(pick.getAttribute("aria-pressed"), "false");
    pick.click();
    await waitFor(() => getLinks(source)[0]?.stance === -2, "stance saved");
  });

  it("saves trimmed page numbers and clears empty ones", async function () {
    await withOneLink({ targetPages: "90" });
    const body = await render();
    const [src, tgt] = Array.from(
      body.querySelectorAll("input"),
    ) as HTMLInputElement[];
    src.value = "  36 ";
    fire(src, "change");
    await waitFor(() => getLinks(source)[0]?.sourcePages === "36", "saved");
    tgt.value = "";
    fire(tgt, "change");
    await waitFor(
      () => getLinks(source)[0]?.targetPages === undefined,
      "cleared",
    );
  });

  it("saves and clears the comment", async function () {
    await withOneLink();
    const body = await render();
    const comment = body.querySelector("textarea")!;
    comment.value = "line one\nline two";
    fire(comment, "change");
    await waitFor(
      () => getLinks(source)[0]?.comment === "line one\nline two",
      "comment saved",
    );
    comment.value = "";
    fire(comment, "change");
    await waitFor(
      () => getLinks(source)[0]?.comment === undefined,
      "comment cleared",
    );
  });

  it("deletes only the clicked reference", async function () {
    const keep = makeLink(target.key, lib, 2);
    const drop = makeLink(target.key, lib, -2);
    await setLinks(source, [keep, drop]);
    const body = await render();
    buttons(body, getString("delete-button"))[1].click();
    await waitFor(() => getLinks(source).length === 1, "one link deleted");
    assert.equal(getLinks(source)[0].id, keep.id);
  });

  it("offers the PDF jump link only for a complete anchor", async function () {
    const anchorText = getString("anchor-open");
    const att = await makePdfAttachment(source, lib);
    created.unshift(att);
    const ann = await saveSelectionHighlight(att, {
      type: "highlight",
      text: "anchored passage",
      comment: "",
      pageLabel: "3",
      sortIndex: "00000|000100|00100",
      position: { pageIndex: 0, rects: [[100, 100, 200, 120]] },
      tags: [],
    } as any);
    created.unshift(ann);

    await withOneLink({ sourceAttachmentKey: att.key });
    assert.notInclude((await render()).textContent, anchorText);
    await withOneLink({
      sourceAttachmentKey: att.key,
      sourceAnnotationKey: ann.key,
    });
    assert.include((await render()).textContent, anchorText);
  });

  it("marks an anchor whose highlight was deleted instead of linking it (F7)", async function () {
    await withOneLink({
      sourceAttachmentKey: "AAAAAAAA",
      sourceAnnotationKey: "BBBBBBBB",
    });
    const text = (await render()).textContent;
    assert.notInclude(text, getString("anchor-open"));
    assert.include(text, getString("anchor-missing"));
  });

  describe("resolveTargetItem", function () {
    it("returns a regular item unchanged", function () {
      assert.equal(resolveTargetItem(source), source);
    });

    it("maps a child attachment to its parent", async function () {
      const att = await makePdfAttachment(source, lib);
      created.unshift(att);
      assert.equal(resolveTargetItem(att)?.id, source.id);
    });

    it("returns null for a standalone attachment", async function () {
      const att = await makePdfAttachment(undefined, lib);
      created.unshift(att);
      assert.isNull(resolveTargetItem(att));
    });
  });
});
