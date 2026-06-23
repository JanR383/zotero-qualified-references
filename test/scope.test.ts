import { assert } from "chai";
import { makePredicate } from "../src/modules/scope";

/**
 * Integration tests for scope filtering (N6), run inside Zotero by
 * `zotero-plugin test` with real libraries/collections — the predicate relies on
 * Zotero.Collections descendant resolution and item.getCollections(), which only
 * behave correctly against the live API.
 */
describe("scope", function () {
  let lib: number;
  let parent: Zotero.Collection;
  let child: Zotero.Collection;
  let inChild: Zotero.Item;
  let outside: Zotero.Item;

  before(function () {
    lib = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    parent = new Zotero.Collection({
      name: "QRef scope parent",
      libraryID: lib,
    });
    await parent.saveTx();
    child = new Zotero.Collection({
      name: "QRef scope child",
      libraryID: lib,
      parentID: parent.id,
    });
    await child.saveTx();

    inChild = new Zotero.Item("journalArticle");
    inChild.libraryID = lib;
    inChild.setField("title", "QRef in child");
    inChild.addToCollection(child.id);
    await inChild.saveTx();

    outside = new Zotero.Item("journalArticle");
    outside.libraryID = lib;
    outside.setField("title", "QRef outside");
    await outside.saveTx();
  });

  afterEach(async function () {
    for (const item of [inChild, outside]) {
      if (item && Zotero.Items.get(item.id)) await item.eraseTx();
    }
    for (const c of [child, parent]) {
      if (c && Zotero.Collections.get(c.id)) await c.eraseTx();
    }
  });

  it("returns undefined for 'all' (no filtering)", function () {
    assert.isUndefined(makePredicate("all"));
  });

  it("library scope matches items in that library", function () {
    const pred = makePredicate(`lib:${lib}`);
    assert.isFunction(pred);
    assert.isTrue(pred!(inChild));
  });

  it("collection scope includes sub-collections, excludes others", function () {
    const pred = makePredicate(`col:${parent.id}`);
    assert.isFunction(pred);
    assert.isTrue(pred!(inChild)); // in a descendant collection of parent
    assert.isFalse(pred!(outside)); // not in the collection tree
  });
});
