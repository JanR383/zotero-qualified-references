import { assert } from "chai";
import {
  getIncoming,
  makeLink,
  rebuildIndex,
  setLinks,
} from "../src/modules/storage";
import { eraseItems, makeItem, wirePluginGlobals } from "./helpers";

/**
 * rebuildIndex awaits the DB between reading a library's item IDs and walking
 * the loaded items. Notifier events run in that window against the half-built
 * index; these tests pin down what must hold afterwards.
 */
describe("rebuildIndex concurrency", function () {
  let lib: number;
  let target: Zotero.Item;
  let doomed: Zotero.Item;
  let survivor: Zotero.Item;

  before(function () {
    wirePluginGlobals();
    lib = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    target = await makeItem(lib, "QRef rebuild target");
    doomed = await makeItem(lib, "QRef rebuild doomed source");
    survivor = await makeItem(lib, "QRef rebuild surviving source");
    await setLinks(doomed, [makeLink(target.key, lib)]);
    await setLinks(survivor, [makeLink(target.key, lib)]);
  });

  afterEach(async function () {
    await eraseItems([doomed, survivor, target]);
  });

  /**
   * Run rebuildIndex with `during` executed right after Zotero.Items
   * .loadDataTypes resolves for the batch containing `trigger` — the last
   * await before the walk, i.e. where a real delete event can slip in.
   */
  async function rebuildWith(
    trigger: Zotero.Item,
    during: () => Promise<void>,
  ): Promise<boolean> {
    const items = Zotero.Items as any;
    const hadOwn = Object.prototype.hasOwnProperty.call(items, "loadDataTypes");
    const original = items.loadDataTypes;
    const triggerID = trigger.id;
    let fired = false;
    items.loadDataTypes = async function (
      objs: Zotero.Item[],
      types: string[],
    ) {
      await original.call(this, objs, types);
      if (!fired && objs.some((o) => o && o.id === triggerID)) {
        fired = true;
        await during();
      }
    };
    try {
      await rebuildIndex();
    } finally {
      if (hadOwn) items.loadDataTypes = original;
      else delete items.loadDataTypes;
    }
    return fired;
  }

  it("does not resurrect a source erased while the rebuild is in flight", async function () {
    const erasedID = doomed.id;
    const fired = await rebuildWith(doomed, () => doomed.eraseTx());

    assert.isTrue(fired, "hook should have erased the source mid-rebuild");
    assert.isNotOk(
      getIncoming(target).find((i) => i.sourceID === erasedID),
      "erased source must not be indexed",
    );
    assert.isFalse(
      (addon as any).data.incomingBySource.has(erasedID),
      "erased source must not be in the secondary index",
    );
    // Guards against a "fix" that aborts the whole library instead.
    assert.isOk(
      getIncoming(target).find((i) => i.sourceID === survivor.id),
      "the rest of the library must still be indexed",
    );
  });

  it("does not index a source trashed while the rebuild is in flight", async function () {
    const fired = await rebuildWith(doomed, async () => {
      doomed.deleted = true;
      await doomed.saveTx();
    });

    assert.isTrue(fired);
    assert.isNotOk(getIncoming(target).find((i) => i.sourceID === doomed.id));
    assert.isOk(getIncoming(target).find((i) => i.sourceID === survivor.id));
  });
});
