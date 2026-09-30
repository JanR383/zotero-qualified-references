import { assert } from "chai";
import {
  getIncoming,
  makeLink,
  rebuildIndex,
  setLinks,
} from "../src/modules/storage";
import { eraseItems, makeItem, wirePluginGlobals } from "./helpers";

/**
 * rebuildIndex selects candidate items in SQL (Extra contains the
 * Reference-Graph line) and only loads those.
 */
describe("rebuildIndex prefilter (F8)", function () {
  let lib: number;
  let target: Zotero.Item;
  let source: Zotero.Item;
  let plain: Zotero.Item;

  before(function () {
    wirePluginGlobals();
    lib = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    target = await makeItem(lib, "QRef prefilter target");
    plain = await makeItem(lib, "QRef prefilter plain", "PMID: 123");
    source = await makeItem(lib, "QRef prefilter source", "PMID: 456");
    // Reference-Graph after another Extra line, as users may have it.
    await setLinks(source, [makeLink(target.key, lib, -1)]);
  });

  afterEach(async function () {
    await eraseItems([source, plain, target]);
  });

  it("loads only items carrying references and still indexes them", async function () {
    const items = Zotero.Items as any;
    const hadOwn = Object.prototype.hasOwnProperty.call(items, "loadDataTypes");
    const original = items.loadDataTypes;
    const loaded = new Set<number>();
    items.loadDataTypes = async function (
      objs: Zotero.Item[],
      types: string[],
    ) {
      for (const o of objs) if (o) loaded.add(o.id);
      return original.call(this, objs, types);
    };
    try {
      await rebuildIndex();
    } finally {
      if (hadOwn) items.loadDataTypes = original;
      else delete items.loadDataTypes;
    }
    assert.isTrue(loaded.has(source.id), "source loaded");
    assert.isFalse(loaded.has(plain.id), "item without references not loaded");
    assert.isFalse(loaded.has(target.id), "target not loaded");
    const inc = getIncoming(target).find((i) => i.sourceID === source.id);
    assert.equal(inc?.link.stance, -1);
  });
});
