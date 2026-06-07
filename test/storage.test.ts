import { assert } from "chai";
import { config } from "../package.json";
import {
  getIncoming,
  getLinks,
  makeLink,
  onItemChanged,
  rebuildIndex,
  setLinks,
} from "../src/modules/storage";

/**
 * Integration tests for the storage layer, run inside Zotero by
 * `zotero-plugin test`. They use real Zotero items because every storage bug we
 * hit (getAsync returning data-less shells, the reverse index after restart)
 * lived in the Zotero API boundary — mocked items would not catch them.
 */
describe("storage", function () {
  // Resolved in before() rather than the describe body: accessing Zotero APIs at
  // collection time trips eslint's mocha/no-setup-in-describe (getters may run).
  let lib: number;
  let source: Zotero.Item;
  let target: Zotero.Item;

  before(function () {
    // storage.ts reaches the reverse index via the `addon`/`ztoolkit` globals,
    // which the plugin defines on its own sandbox (`_globalThis` in index.ts) —
    // not in this test bundle's scope. Wire them to the live plugin instance
    // (reachable as Zotero[addonInstance]) so the imported index functions
    // operate on the same Map the plugin maintains.
    const plugin = (Zotero as any)[config.addonInstance];
    (globalThis as any).addon = plugin;
    (globalThis as any).ztoolkit = plugin.data.ztoolkit;
    lib = Zotero.Libraries.userLibraryID;
  });

  async function makeItem(title: string): Promise<Zotero.Item> {
    const item = new Zotero.Item("journalArticle");
    item.libraryID = lib;
    item.setField("title", title);
    await item.saveTx();
    return item;
  }

  beforeEach(async function () {
    source = await makeItem("QRef test source");
    target = await makeItem("QRef test target");
  });

  afterEach(async function () {
    for (const item of [source, target]) {
      if (item && Zotero.Items.get(item.id)) await item.eraseTx();
    }
  });

  describe("makeLink", function () {
    it("populates the required fields with a default neutral stance", function () {
      const link = makeLink(target.key, lib);
      assert.equal(link.targetKey, target.key);
      assert.equal(link.targetLib, lib);
      assert.equal(link.stance, 0);
      assert.isString(link.id);
      assert.isNotEmpty(link.id);
      assert.equal(link.added, link.modified);
    });

    it("honours an explicit stance", function () {
      assert.equal(makeLink(target.key, lib, -2).stance, -2);
    });
  });

  describe("getLinks / setLinks roundtrip", function () {
    it("returns an empty array when no links are stored", function () {
      assert.deepEqual(getLinks(source), []);
    });

    it("persists and reads back links", async function () {
      const link = makeLink(target.key, lib, 2);
      await setLinks(source, [link]);
      const read = getLinks(source);
      assert.lengthOf(read, 1);
      assert.equal(read[0].targetKey, target.key);
      assert.equal(read[0].stance, 2);
    });

    it("preserves unrelated Extra lines", async function () {
      source.setField("extra", "DOI: 10.1/abc\nFoo: bar");
      await source.saveTx();
      await setLinks(source, [makeLink(target.key, lib)]);
      const extra = source.getField("extra");
      assert.include(extra, "DOI: 10.1/abc");
      assert.include(extra, "Foo: bar");
      assert.lengthOf(getLinks(source), 1);
    });

    it("removes the Reference-Graph line when links are emptied", async function () {
      await setLinks(source, [makeLink(target.key, lib)]);
      await setLinks(source, []);
      assert.deepEqual(getLinks(source), []);
      assert.notInclude(source.getField("extra"), "Reference-Graph");
    });
  });

  describe("reverse index", function () {
    it("rebuildIndex finds the source and getIncoming exposes it (BF0)", async function () {
      await setLinks(source, [makeLink(target.key, lib, 1)]);
      await rebuildIndex();
      const incoming = getIncoming(target);
      const found = incoming.find((i) => i.sourceID === source.id);
      assert.isOk(found, "target should be referenced by source after rebuild");
      assert.equal(found!.link.stance, 1);
    });

    it("onItemChanged adds and removes a source incrementally", async function () {
      await setLinks(source, [makeLink(target.key, lib)]);
      onItemChanged(source.id, false);
      assert.isOk(getIncoming(target).find((i) => i.sourceID === source.id));

      onItemChanged(source.id, true);
      assert.isNotOk(getIncoming(target).find((i) => i.sourceID === source.id));
    });
  });
});
