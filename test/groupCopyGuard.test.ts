import { assert } from "chai";
import { handlePossibleGroupCopy } from "../src/modules/groupCopyGuard";
import { getLinks, makeLink, setLinks } from "../src/modules/storage";
import {
  COPY_PREF,
  createGroup,
  eraseItems,
  makeItem,
  settle,
  wirePluginGlobals,
} from "./helpers";

/**
 * Integration tests for the group-copy privacy guard, run inside Zotero with a
 * real (local-only) group library. The guard's decision hinges on
 * Zotero.Libraries/Items lookups across libraries, which mocks would not model.
 *
 * Items are created without references and the Reference-Graph line is added
 * with a second save: that save fires `modify`, which the plugin's own notifier
 * does not route to the guard. Before that second save the test waits for the
 * guard run triggered by the creating `add` to finish, so the live plugin
 * cannot strip the fixture before the test calls handlePossibleGroupCopy.
 */
describe("groupCopyGuard", function () {
  let userLib: number;
  let group: any;
  let groupLib: number;
  let otherGroup: any;
  let prefBefore: unknown;
  let created: Zotero.Item[];

  before(async function () {
    wirePluginGlobals();
    userLib = Zotero.Libraries.userLibraryID;
    group = await createGroup("QRef guard test group");
    groupLib = group.libraryID;
    otherGroup = await createGroup("QRef guard test group 2");
  });

  after(async function () {
    if (group) await group.eraseTx();
    if (otherGroup) await otherGroup.eraseTx();
  });

  beforeEach(function () {
    created = [];
    prefBefore = Zotero.Prefs.get(COPY_PREF, true);
    Zotero.Prefs.set(COPY_PREF, false, true);
  });

  afterEach(async function () {
    Zotero.Prefs.set(COPY_PREF, prefBefore as boolean, true);
    await eraseItems(created);
  });

  async function item(lib: number, title: string): Promise<Zotero.Item> {
    const it = await makeItem(lib, title);
    created.push(it);
    if (lib === groupLib) await settle();
    return it;
  }

  /** A group item whose references point at `targets`. */
  async function groupItemReferencing(
    targets: Zotero.Item[],
  ): Promise<Zotero.Item> {
    const source = await item(groupLib, "QRef group source");
    await setLinks(
      source,
      targets.map((t) => makeLink(t.key, t.libraryID, 1)),
    );
    assert.lengthOf(getLinks(source), targets.length, "fixture has links");
    return source;
  }

  it("strips references of a personal→group copy by default", async function () {
    const personalTarget = await item(userLib, "QRef personal target");
    const source = await groupItemReferencing([personalTarget]);

    await handlePossibleGroupCopy(source.id);

    assert.deepEqual(getLinks(source), []);
    assert.equal(source.getField("extra"), "Reference-Graph: []");
  });

  it("keeps the references when copyRefsToGroup is enabled", async function () {
    Zotero.Prefs.set(COPY_PREF, true, true);
    const personalTarget = await item(userLib, "QRef personal target");
    const source = await groupItemReferencing([personalTarget]);

    await handlePossibleGroupCopy(source.id);

    assert.lengthOf(getLinks(source), 1);
  });

  it("strips when at least one of several targets is personal", async function () {
    const groupTarget = await item(groupLib, "QRef group target");
    const personalTarget = await item(userLib, "QRef personal target");
    const source = await groupItemReferencing([groupTarget, personalTarget]);

    await handlePossibleGroupCopy(source.id);

    assert.deepEqual(getLinks(source), []);
  });

  it("leaves in-group references alone", async function () {
    const groupTarget = await item(groupLib, "QRef group target");
    const source = await groupItemReferencing([groupTarget]);

    await handlePossibleGroupCopy(source.id);

    assert.lengthOf(getLinks(source), 1);
  });

  it("strips a copy whose personal target was erased", async function () {
    const personalTarget = await item(userLib, "QRef personal target");
    const source = await groupItemReferencing([personalTarget]);
    await personalTarget.eraseTx();

    await handlePossibleGroupCopy(source.id);

    assert.deepEqual(getLinks(source), []);
  });

  it("strips a copy whose targets live in another group", async function () {
    const otherTarget = await item(
      otherGroup.libraryID,
      "QRef other group target",
    );
    const source = await groupItemReferencing([otherTarget]);

    await handlePossibleGroupCopy(source.id);

    assert.deepEqual(getLinks(source), []);
  });

  it("leaves unresolvable targets alone (another member's synced item)", async function () {
    const source = await item(groupLib, "QRef group source");
    // Target key that exists in none of the local libraries.
    await setLinks(source, [makeLink("ZZZZZZZZ", userLib, 1)]);
    // Downloaded by sync, not created on this device.
    await source.updateVersion(5);

    await handlePossibleGroupCopy(source.id);

    assert.lengthOf(getLinks(source), 1);
  });

  it("ignores items in the personal library", async function () {
    const target = await item(userLib, "QRef personal target");
    const source = await item(userLib, "QRef personal source");
    await setLinks(source, [makeLink(target.key, userLib, 1)]);

    await handlePossibleGroupCopy(source.id);

    assert.lengthOf(getLinks(source), 1);
  });

  it("ignores trashed group items", async function () {
    const personalTarget = await item(userLib, "QRef personal target");
    const source = await groupItemReferencing([personalTarget]);
    source.deleted = true;
    await source.saveTx();

    await handlePossibleGroupCopy(source.id);

    assert.lengthOf(getLinks(source), 1);
  });

  it("does not throw for an unknown item id", async function () {
    await handlePossibleGroupCopy(2 ** 31 - 1);
  });
});
