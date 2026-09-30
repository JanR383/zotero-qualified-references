import { assert } from "chai";
import {
  getIncoming,
  getLinks,
  makeLink,
  setLinks,
} from "../src/modules/storage";
import {
  COPY_PREF,
  createGroup,
  eraseItems,
  makeItem,
  refsLine,
  waitFor,
  wirePluginGlobals,
} from "./helpers";

/**
 * Integration tests for the live plugin's Notifier observer (registered by
 * initIndexAndNotifier at startup). They make real item changes and observe
 * the plugin's reverse index and the stored references; nothing here calls the
 * observer directly, so a broken registration or event filter fails the test.
 */
describe("notifier", function () {
  let lib: number;
  let target: Zotero.Item;
  let source: Zotero.Item | undefined;

  before(function () {
    wirePluginGlobals();
    lib = Zotero.Libraries.userLibraryID;
  });

  beforeEach(async function () {
    target = await makeItem(lib, "QRef notifier target");
    source = undefined;
  });

  afterEach(async function () {
    await eraseItems([source, target]);
  });

  const incomingFrom = (id: number) =>
    getIncoming(target).find((i) => i.sourceID === id);

  async function makeSource(stance: -2 | -1 | 0 | 1 | 2 = 1) {
    source = await makeItem(
      lib,
      "QRef notifier source",
      refsLine([makeLink(target.key, lib, stance)]),
    );
    return source;
  }

  it("indexes a newly added source (add)", async function () {
    const s = await makeSource(2);
    await waitFor(() => !!incomingFrom(s.id), "source indexed after add");
    assert.equal(incomingFrom(s.id)!.link.stance, 2);
  });

  it("follows changes to the references (modify)", async function () {
    const s = await makeSource(1);
    await waitFor(() => !!incomingFrom(s.id), "source indexed after add");

    await setLinks(s, [makeLink(target.key, lib, -2)]);
    await waitFor(
      () => incomingFrom(s.id)?.link.stance === -2,
      "stance updated after modify",
    );

    await setLinks(s, []);
    await waitFor(() => !incomingFrom(s.id), "entry gone after links cleared");
  });

  it("drops a trashed source and restores it when untrashed (trash)", async function () {
    const s = await makeSource();
    await waitFor(() => !!incomingFrom(s.id), "source indexed after add");

    s.deleted = true;
    await s.saveTx();
    await waitFor(() => !incomingFrom(s.id), "entry gone after trash");

    s.deleted = false;
    await s.saveTx();
    await waitFor(() => !!incomingFrom(s.id), "entry back after restore");
  });

  it("drops an erased source from both indexes (delete)", async function () {
    const s = await makeSource();
    const id = s.id;
    await waitFor(() => !!incomingFrom(id), "source indexed after add");

    await s.eraseTx();
    await waitFor(() => !incomingFrom(id), "entry gone after erase");
    assert.isFalse((addon as any).data.incomingBySource.has(id));
  });

  it("asks the item trees to refresh the target's row when a source changes (F5)", async function () {
    const refreshed: number[] = [];
    const observer = Zotero.Notifier.registerObserver(
      {
        notify: (event: string, _type: string, ids: Array<string | number>) => {
          if (event === "refresh") refreshed.push(...ids.map(Number));
        },
      },
      ["item"],
      "qref-test",
    );
    try {
      const s = await makeSource(1);
      await waitFor(
        () => refreshed.includes(target.id),
        "target refreshed after add",
      );
      refreshed.length = 0;
      await setLinks(s, []);
      await waitFor(
        () => refreshed.includes(target.id),
        "target refreshed after the link was removed",
      );
    } finally {
      Zotero.Notifier.unregisterObserver(observer);
    }
  });

  describe("group-copy guard wiring", function () {
    let group: any;
    let prefBefore: unknown;

    before(async function () {
      group = await createGroup("QRef notifier test group");
    });

    after(async function () {
      if (group) await group.eraseTx();
    });

    beforeEach(function () {
      prefBefore = Zotero.Prefs.get(COPY_PREF, true);
      Zotero.Prefs.set(COPY_PREF, false, true);
    });

    afterEach(function () {
      Zotero.Prefs.set(COPY_PREF, prefBefore as boolean, true);
    });

    it("strips references from an item added to a group with personal targets", async function () {
      // One save with the Reference-Graph line already present — the shape of
      // Zotero's personal→group copy, which fires a single `add`.
      const copy = await makeItem(
        group.libraryID,
        "QRef notifier group copy",
        refsLine([makeLink(target.key, lib, 1)]),
      );
      await waitFor(
        () => getLinks(copy).length === 0,
        "references stripped by the guard",
      );
      assert.notInclude(copy.getField("extra"), "Reference-Graph");
    });
  });
});
