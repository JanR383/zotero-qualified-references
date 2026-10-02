import { assert } from "chai";
import {
  itemHistory,
  restoreEntry,
  trackLineChange,
  wasRemovedExternally,
} from "../src/modules/history";
import { getLinks, makeLink, setLinks } from "../src/modules/storage";
import { eraseItems, makeItem, wirePluginGlobals } from "./helpers";

/**
 * Integration tests for the change journal (S4) and detecting removals by
 * other tools (S5). The plugin's own notifier tracks its own copy of the
 * journal; these tests call trackLineChange on the test bundle's copy, like
 * the notifier does after each save.
 */
describe("change journal", function () {
  let lib: number;
  let source: Zotero.Item;
  let target: Zotero.Item;

  before(function () {
    wirePluginGlobals();
    lib = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    source = await makeItem(lib, "QRef journal source", "DOI: 10.1/abc");
    target = await makeItem(lib, "QRef journal target");
  });

  afterEach(async function () {
    await eraseItems([source, target]);
  });

  async function save(links = [makeLink(target.key, lib, 1)]) {
    await setLinks(source, links);
    trackLineChange(source.id);
  }

  /** A change made by another tool: Extra is edited directly. */
  async function editExtra(value: string): Promise<boolean> {
    source.setField("extra", value);
    await source.saveTx();
    return trackLineChange(source.id);
  }

  it("journals the state each change replaces", async function () {
    await save();
    await save([makeLink(target.key, lib, 2), makeLink(target.key, lib, -1)]);
    const history = itemHistory(source);
    assert.lengthOf(history, 1);
    assert.equal(history[0].count, 1);
    assert.isFalse(wasRemovedExternally(source));
  });

  it("detects references removed by another tool and restores them", async function () {
    await save();
    const [link] = getLinks(source);
    assert.isTrue(await editExtra("DOI: 10.1/abc"));
    assert.isTrue(wasRemovedExternally(source));

    await restoreEntry(source, itemHistory(source)[0]);
    trackLineChange(source.id);
    const [restored] = getLinks(source);
    assert.equal(restored.id, link.id);
    assert.equal(restored.stance, 1);
    assert.isFalse(wasRemovedExternally(source));
  });

  it("detects a line made unreadable by another tool", async function () {
    await save();
    assert.isTrue(await editExtra("DOI: 10.1/abc\nReference-Graph: [{"));
  });

  it("does not report the plugin deleting the last reference", async function () {
    await save();
    await save([]);
    assert.isFalse(wasRemovedExternally(source));
    // Same change arriving by sync from another device.
    await save();
    assert.isFalse(await editExtra("DOI: 10.1/abc\nReference-Graph: []"));
  });

  it("does not report undo of adding the first reference", async function () {
    await setLinks(source, [makeLink(target.key, lib)], { action: "add" });
    trackLineChange(source.id);
    // Edit > Undo restores the Extra field from before the save.
    assert.isFalse(await editExtra("DOI: 10.1/abc"));
  });
});
