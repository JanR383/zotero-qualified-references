import { assert } from "chai";
import {
  BACKUP_FORMAT,
  buildBackup,
  parseBackup,
  restoreItems,
} from "../src/modules/backup";
import {
  getLinks,
  makeLink,
  onItemChanged,
  setLinks,
} from "../src/modules/storage";
import { eraseItems, makeItem, wirePluginGlobals } from "./helpers";

/** Integration tests for backup and restore (S2), against real items. */
describe("backup and restore", function () {
  let lib: number;
  let source: Zotero.Item;
  let target: Zotero.Item;

  before(function () {
    wirePluginGlobals();
    lib = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    source = await makeItem(lib, "QRef backup source");
    target = await makeItem(lib, "QRef backup target");
  });

  afterEach(async function () {
    await eraseItems([source, target]);
  });

  async function addReference(): Promise<string> {
    const link = makeLink(target.key, target.libraryID, 2);
    link.comment = "Kommentar mit Umlauten: äöü";
    link.sourcePages = "12";
    link.sourceAttachmentKey = "ATTACH01";
    link.sourceAnnotationKey = "ANNOT001";
    await setLinks(source, [link]);
    // Index the source now instead of waiting for the notifier.
    onItemChanged(source.id, false);
    return link.id;
  }

  it("backs up every field and restores a deleted reference", async function () {
    const id = await addReference();
    const text = JSON.stringify(buildBackup());
    const entry = parseBackup(text)!.find((i) => i.key === source.key);
    assert.isOk(entry, "source item is in the backup");
    assert.equal(entry!.library, "u");

    await setLinks(source, []);
    const r = await restoreItems(parseBackup(text)!);
    assert.isAtLeast(r.added, 1);
    const [restored] = getLinks(source);
    assert.equal(restored.id, id);
    assert.equal(restored.stance, 2);
    assert.equal(restored.comment, "Kommentar mit Umlauten: äöü");
    assert.equal(restored.sourcePages, "12");
    assert.equal(restored.sourceAnnotationKey, "ANNOT001");
    assert.equal(restored.targetKey, target.key);
  });

  it("changes nothing when the backup matches", async function () {
    await addReference();
    const items = parseBackup(JSON.stringify(buildBackup()))!.filter(
      (i) => i.key === source.key,
    );
    const r = await restoreItems(items);
    assert.equal(r.added + r.updated + r.items, 0);
  });

  it("counts items that are not in this Zotero", async function () {
    const r = await restoreItems([
      { library: "u", key: "NOSUCHKY", title: "", links: [] },
      { library: "g999999999", key: "NOSUCHKY", title: "", links: [] },
    ]);
    assert.equal(r.notFound, 2);
  });

  it("rejects files that are not a backup", function () {
    assert.isNull(parseBackup("not json"));
    assert.isNull(parseBackup(JSON.stringify({ format: "other", items: [] })));
    assert.isNull(
      parseBackup(
        JSON.stringify({ format: BACKUP_FORMAT, version: 99, items: [] }),
      ),
    );
  });
});
