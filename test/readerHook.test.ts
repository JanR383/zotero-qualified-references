import { assert } from "chai";
import { config } from "../package.json";
import {
  addAnchoredLinks,
  annotationMenuHandler,
  resolveSource,
  saveSelectionHighlight,
  selectionPopupHandler,
} from "../src/modules/readerHook";
import { getLinks, makeLink, setLinks } from "../src/modules/storage";
import { getString } from "../src/utils/locale";
import {
  eraseItems,
  makeItem,
  makePdfAttachment,
  wirePluginGlobals,
} from "./helpers";

/**
 * Integration tests for the PDF-reader hook. The reader events are fed with
 * hand-built event objects (no PDF is opened), and the modal item picker is
 * bypassed by calling addAnchoredLinks with the ids it would return. Menu and
 * button commands are therefore not invoked here.
 */
const BUTTON_PREF = `${config.prefsPrefix}.readerSelectionButton`;

describe("readerHook", function () {
  let lib: number;
  let source: Zotero.Item;
  let target: Zotero.Item;
  let att: Zotero.Item;
  let created: Array<Zotero.Item | undefined>;

  before(function () {
    wirePluginGlobals();
    lib = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    source = await makeItem(lib, "QRef reader source");
    target = await makeItem(lib, "QRef reader target");
    att = await makePdfAttachment(source, lib);
    created = [att, source, target];
  });

  afterEach(async function () {
    await eraseItems(created);
  });

  describe("resolveSource", function () {
    it("resolves the attachment and its parent", function () {
      const r = resolveSource({ itemID: att.id });
      assert.equal(r?.att.id, att.id);
      assert.equal(r?.source.id, source.id);
    });

    it("returns null for a standalone attachment", async function () {
      const lone = await makePdfAttachment(undefined, lib);
      created.unshift(lone);
      assert.isNull(resolveSource({ itemID: lone.id }));
    });

    it("returns null for an unknown item", function () {
      assert.isNull(resolveSource({ itemID: 999999999 }));
    });
  });

  describe("addAnchoredLinks", function () {
    it("appends anchored links after the existing ones", async function () {
      const existing = makeLink(target.key, lib, 2);
      await setLinks(source, [existing]);

      const res = await addAnchoredLinks(att, source, "ANNKEY01", "36", [
        target.id,
      ]);

      assert.deepEqual(res, { added: 1, lastTitle: "QRef reader target" });
      const links = getLinks(source);
      assert.lengthOf(links, 2);
      assert.equal(links[0].id, existing.id);
      assert.include(links[1], {
        targetKey: target.key,
        targetLib: lib,
        sourcePages: "36",
        sourceAttachmentKey: att.key,
        sourceAnnotationKey: "ANNKEY01",
        stance: 0,
      });
    });

    it("skips self-references and unknown ids without saving", async function () {
      const extraBefore = source.getField("extra");
      const res = await addAnchoredLinks(att, source, "ANNKEY01", undefined, [
        source.id,
        999999999,
      ]);
      assert.equal(res.added, 0);
      assert.equal(source.getField("extra"), extraBefore);
    });

    it("leaves sourcePages unset without a page label", async function () {
      await addAnchoredLinks(att, source, "ANNKEY01", undefined, [target.id]);
      assert.isUndefined(getLinks(source)[0].sourcePages);
    });
  });

  describe("saveSelectionHighlight", function () {
    const selection = (color?: string) =>
      ({
        type: "highlight",
        text: "selected passage",
        comment: "",
        color,
        pageLabel: "12",
        sortIndex: "00000|000100|00100",
        position: { pageIndex: 0, rects: [[100, 100, 200, 120]] },
        tags: [],
      }) as any;

    it("saves a keyed highlight under the attachment", async function () {
      const ann = await saveSelectionHighlight(att, selection("#2ea8e5"));
      created.unshift(ann);
      assert.isTrue(ann.isAnnotation());
      assert.equal(ann.parentItemID, att.id);
      assert.isString(ann.key);
      assert.equal(ann.annotationType, "highlight");
      assert.equal(ann.annotationText, "selected passage");
      assert.equal(ann.annotationPageLabel, "12");
      assert.equal(ann.annotationColor, "#2ea8e5");
    });

    it("falls back to Zotero's default colour", async function () {
      const ann = await saveSelectionHighlight(att, selection());
      created.unshift(ann);
      assert.equal(ann.annotationColor, Zotero.Annotations.DEFAULT_COLOR);
    });
  });

  describe("annotationMenuHandler", function () {
    function menuFor(params: { ids?: string[]; currentID?: string }) {
      const entries: Array<{ label: string }> = [];
      annotationMenuHandler({
        reader: { itemID: att.id },
        params,
        append: (e) => entries.push(e),
      });
      return entries;
    }

    it("adds the menu entry for a right-clicked annotation", function () {
      const entries = menuFor({ currentID: "AAAAAAAA", ids: ["BBBBBBBB"] });
      assert.lengthOf(entries, 1);
      assert.equal(entries[0].label, getString("reader-add-ref"));
    });

    it("falls back to the first selected annotation", function () {
      assert.lengthOf(menuFor({ ids: ["BBBBBBBB"] }), 1);
    });

    it("adds nothing without an annotation", function () {
      assert.lengthOf(menuFor({}), 0);
    });
  });

  describe("selectionPopupHandler", function () {
    let prefBefore: unknown;

    beforeEach(function () {
      prefBefore = Zotero.Prefs.get(BUTTON_PREF, true);
    });

    afterEach(function () {
      if (prefBefore === undefined) Zotero.Prefs.clear(BUTTON_PREF, true);
      else Zotero.Prefs.set(BUTTON_PREF, prefBefore as boolean, true);
    });

    function popup(): Node[] {
      const nodes: Node[] = [];
      selectionPopupHandler({
        reader: { itemID: att.id },
        doc: Zotero.getMainWindow().document,
        params: { annotation: {} as any },
        append: (n) => nodes.push(n),
      });
      return nodes;
    }

    it("adds the button when enabled", function () {
      Zotero.Prefs.set(BUTTON_PREF, true, true);
      const nodes = popup();
      assert.lengthOf(nodes, 1);
      assert.equal(nodes[0].textContent, getString("reader-add-ref"));
    });

    it("adds nothing when disabled in the settings", function () {
      Zotero.Prefs.set(BUTTON_PREF, false, true);
      assert.lengthOf(popup(), 0);
    });
  });
});
