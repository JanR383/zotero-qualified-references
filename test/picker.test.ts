import { assert } from "chai";
import { referenceTargets } from "../src/modules/picker";
import { eraseItems, makeItem, makePdfAttachment } from "./helpers";

describe("referenceTargets (F6)", function () {
  let lib: number;
  let source: Zotero.Item;
  let target: Zotero.Item;
  let created: Array<Zotero.Item | undefined>;

  before(function () {
    lib = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    source = await makeItem(lib, "QRef picker source");
    target = await makeItem(lib, "QRef picker target");
    created = [source, target];
  });

  afterEach(async function () {
    await eraseItems(created);
  });

  async function note(parent?: Zotero.Item): Promise<Zotero.Item> {
    const n = new Zotero.Item("note");
    n.libraryID = lib;
    if (parent) n.parentID = parent.id;
    n.setNote("QRef picker note");
    await n.saveTx();
    created.unshift(n);
    return n;
  }

  it("keeps regular items in pick order, without the source or duplicates", function () {
    assert.deepEqual(
      referenceTargets(source, [target.id, source.id, target.id, 999999999]),
      [target.id],
    );
  });

  it("maps a child note or attachment to its parent item", async function () {
    const child = await note(target);
    const att = await makePdfAttachment(target, lib);
    created.unshift(att);
    assert.deepEqual(referenceTargets(source, [child.id, att.id]), [target.id]);
  });

  it("drops standalone notes and attachments, and the source's own children", async function () {
    const standalone = await note();
    const att = await makePdfAttachment(undefined, lib);
    created.unshift(att);
    const own = await note(source);
    assert.deepEqual(
      referenceTargets(source, [standalone.id, att.id, own.id]),
      [],
    );
  });

  it("drops items in the trash", async function () {
    target.deleted = true;
    await target.saveTx();
    assert.deepEqual(referenceTargets(source, [target.id]), []);
  });
});
