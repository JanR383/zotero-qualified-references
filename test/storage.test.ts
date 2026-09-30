import { assert } from "chai";
import { config } from "../package.json";
import {
  forEachResolvedLink,
  getIncoming,
  getLinks,
  itemForIndexKey,
  libraryIDFromRef,
  libraryRef,
  makeLink,
  onItemChanged,
  rebuildIndex,
  setLinks,
  updateLink,
  updateLinks,
} from "../src/modules/storage";
import { createGroup } from "./helpers";

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

    it("is idempotent: re-indexing the same source does not duplicate (rebuild race)", async function () {
      await setLinks(source, [makeLink(target.key, lib)]);
      // Simulate a concurrent notifier add followed by the background rebuild
      // touching the same source — must not produce two incoming entries.
      onItemChanged(source.id, false);
      onItemChanged(source.id, false);
      const incoming = getIncoming(target).filter(
        (i) => i.sourceID === source.id,
      );
      assert.lengthOf(incoming, 1);
    });

    it("keeps the secondary source index in sync on add and remove", async function () {
      await setLinks(source, [makeLink(target.key, lib)]);
      onItemChanged(source.id, false);
      assert.isOk(
        (addon as any).data.incomingBySource.has(source.id),
        "source should be tracked after add",
      );
      onItemChanged(source.id, true);
      assert.isNotOk(
        (addon as any).data.incomingBySource.has(source.id),
        "source should be dropped from the secondary index after remove",
      );
    });
  });

  describe("sanitizing untrusted Reference-Graph data (S1)", function () {
    async function writeRaw(json: string): Promise<void> {
      source.setField("extra", `Reference-Graph: ${json}`);
      await source.saveTx();
    }

    it("drops entries that are not objects or lack identity fields", async function () {
      await writeRaw(
        JSON.stringify([
          "string-entry",
          42,
          null,
          { stance: 1 }, // no id/targetKey/targetLib
          { id: "ok1", targetKey: target.key, targetLib: "not-a-number" },
          { id: "ok2", targetKey: target.key, targetLib: lib, stance: 1 },
        ]),
      );
      const links = getLinks(source);
      assert.lengthOf(links, 1);
      assert.equal(links[0].id, "ok2");
    });

    it("clamps out-of-range stance to neutral", async function () {
      await writeRaw(
        JSON.stringify([
          { id: "a", targetKey: target.key, targetLib: lib, stance: 99 },
          { id: "b", targetKey: target.key, targetLib: lib, stance: "++" },
        ]),
      );
      const links = getLinks(source);
      assert.lengthOf(links, 2);
      assert.equal(links[0].stance, 0);
      assert.equal(links[1].stance, 0);
    });

    it("caps oversized string fields", async function () {
      const huge = "x".repeat(50_000);
      await writeRaw(
        JSON.stringify([
          {
            id: "a",
            targetKey: target.key,
            targetLib: lib,
            stance: 1,
            comment: huge,
          },
        ]),
      );
      const links = getLinks(source);
      assert.lengthOf(links, 1);
      assert.isAtMost(links[0].comment!.length, 10_000);
    });

    it("coerces non-string optional fields to undefined", async function () {
      await writeRaw(
        JSON.stringify([
          {
            id: "a",
            targetKey: target.key,
            targetLib: lib,
            stance: 1,
            comment: { nested: true },
            sourcePages: 42,
          },
        ]),
      );
      const links = getLinks(source);
      assert.lengthOf(links, 1);
      assert.isUndefined(links[0].comment);
      assert.isUndefined(links[0].sourcePages);
    });

    it("returns [] for an unparseable Reference-Graph line (A1)", async function () {
      // A truncated/corrupted JSON array must not throw; getLinks logs and
      // yields []. The line itself is left untouched until the next setLinks.
      await writeRaw('[{"id":"a","targetKey":');
      assert.deepEqual(getLinks(source), []);
    });

    it("returns [] when the parsed value is not an array (A1)", async function () {
      await writeRaw(
        JSON.stringify({ id: "a", targetKey: target.key, targetLib: lib }),
      );
      assert.deepEqual(getLinks(source), []);
    });
  });

  describe("device-independent target library (F1)", function () {
    let group: any;
    let groupTarget: Zotero.Item;

    before(async function () {
      group = await createGroup("QRef storage test group");
    });

    after(async function () {
      if (group) await group.eraseTx();
    });

    beforeEach(async function () {
      groupTarget = new Zotero.Item("journalArticle");
      groupTarget.libraryID = group.libraryID;
      groupTarget.setField("title", "QRef group target");
      await groupTarget.saveTx();
    });

    afterEach(async function () {
      if (Zotero.Items.get(groupTarget.id)) await groupTarget.eraseTx();
    });

    async function writeRaw(entries: unknown[]): Promise<void> {
      source.setField("extra", `Reference-Graph: ${JSON.stringify(entries)}`);
      await source.saveTx();
    }

    function storedEntries(): any[] {
      const line = source
        .getField("extra")
        .split("\n")
        .find((l: string) => l.startsWith("Reference-Graph:"))!;
      return JSON.parse(line.slice("Reference-Graph:".length));
    }

    it("maps libraries to stable refs and back", function () {
      assert.equal(libraryRef(lib), "u");
      assert.equal(libraryRef(group.libraryID), `g${group.id}`);
      assert.equal(libraryIDFromRef("u"), lib);
      assert.equal(libraryIDFromRef(`g${group.id}`), group.libraryID);
      assert.isUndefined(libraryIDFromRef("g1"), "unknown group");
      assert.isUndefined(libraryIDFromRef("x"));
    });

    it("writes the stable ref next to the local ID", async function () {
      await setLinks(source, [
        makeLink(target.key, lib),
        makeLink(groupTarget.key, group.libraryID),
      ]);
      const stored = storedEntries();
      assert.equal(stored[0].targetLibRef, "u");
      assert.equal(stored[0].targetLib, lib);
      assert.equal(stored[1].targetLibRef, `g${group.id}`);
      assert.equal(stored[1].targetLib, group.libraryID);
    });

    it("prefers the ref over a libraryID written on another device", async function () {
      // Another device numbered the group differently: its local ID is
      // meaningless here, the ref is not.
      await writeRaw([
        {
          id: "a",
          targetKey: groupTarget.key,
          targetLib: 987654,
          targetLibRef: `g${group.id}`,
        },
      ]);
      const [link] = getLinks(source);
      assert.equal(link.targetLib, group.libraryID);
    });

    it("locates legacy links (no ref) by their target key", async function () {
      await writeRaw([
        { id: "a", targetKey: groupTarget.key, targetLib: 987654 },
      ]);
      const [link] = getLinks(source);
      assert.equal(link.targetLib, group.libraryID);
      // Rewritten with a ref on the next save.
      await setLinks(source, getLinks(source));
      assert.equal(storedEntries()[0].targetLibRef, `g${group.id}`);
    });

    it("keeps a ref to a group this device has not joined", async function () {
      await writeRaw([
        {
          id: "a",
          targetKey: "ABCD2345",
          targetLib: 987654,
          targetLibRef: "g1",
        },
      ]);
      await setLinks(source, getLinks(source));
      const [stored] = storedEntries();
      assert.equal(stored.targetLibRef, "g1");
      assert.equal(stored.targetLib, 987654);
    });

    it("accepts an entry that only has a ref", async function () {
      await writeRaw([{ id: "a", targetKey: target.key, targetLibRef: "u" }]);
      const [link] = getLinks(source);
      assert.equal(link.targetLib, lib);
    });

    it("indexes group targets under their local library", async function () {
      await writeRaw([
        {
          id: "a",
          targetKey: groupTarget.key,
          targetLib: 987654,
          targetLibRef: `g${group.id}`,
        },
      ]);
      onItemChanged(source.id, false);
      assert.isOk(
        getIncoming(groupTarget).find((i) => i.sourceID === source.id),
      );
      onItemChanged(source.id, true);
    });
  });

  describe("updateLink / updateLinks (F3)", function () {
    it("patches the stored link, not a stale copy", async function () {
      const a = makeLink(target.key, lib);
      await setLinks(source, [a]);
      const stale = getLinks(source); // captured "at render time"
      // A concurrent change (sync, reader hook) adds a second link.
      await setLinks(source, [...getLinks(source), makeLink(target.key, lib)]);

      await updateLink(source, stale[0].id, { comment: "edited", stance: -1 });

      const links = getLinks(source);
      assert.lengthOf(links, 2, "the concurrent link survives");
      assert.equal(links[0].comment, "edited");
      assert.equal(links[0].stance, -1);
      assert.notEqual(links[0].modified, a.modified);
    });

    it("clears a field patched with undefined", async function () {
      const a = makeLink(target.key, lib);
      a.sourcePages = "12";
      await setLinks(source, [a]);
      await updateLink(source, a.id, { sourcePages: undefined });
      assert.isUndefined(getLinks(source)[0].sourcePages);
    });

    it("is a no-op for a link that is gone", async function () {
      await setLinks(source, [makeLink(target.key, lib)]);
      const before = source.getField("extra");
      await updateLink(source, "missing", { comment: "x" });
      assert.equal(source.getField("extra"), before);
    });

    it("updateLinks mutates the current links", async function () {
      await setLinks(source, [makeLink(target.key, lib)]);
      await updateLinks(source, (links) => links.splice(0, 1));
      assert.deepEqual(getLinks(source), []);
    });
  });

  describe("targets", function () {
    const linkedTargets = () => {
      const ids: number[] = [];
      forEachResolvedLink((s, t) => {
        if (s.id === source.id) ids.push(t.id);
      });
      return ids;
    };

    it("skips targets in the trash and shows them again once restored (F4)", async function () {
      await setLinks(source, [makeLink(target.key, lib)]);
      onItemChanged(source.id, false);
      assert.deepEqual(linkedTargets(), [target.id]);

      target.deleted = true;
      await target.saveTx();
      assert.deepEqual(linkedTargets(), []);

      target.deleted = false;
      await target.saveTx();
      assert.deepEqual(linkedTargets(), [target.id]);
    });

    it("onItemChanged reports old and new targets (F5)", async function () {
      const other = await makeItem("QRef test other target");
      try {
        await setLinks(source, [makeLink(target.key, lib)]);
        onItemChanged(source.id, false);

        await setLinks(source, [makeLink(other.key, lib)]);
        const keys = [...onItemChanged(source.id, false)];
        const ids = keys.map((k) => (itemForIndexKey(k) || undefined)?.id);
        assert.sameMembers(ids, [target.id, other.id]);

        const removed = [...onItemChanged(source.id, true)];
        assert.deepEqual(
          removed.map((k) => (itemForIndexKey(k) || undefined)?.id),
          [other.id],
        );
      } finally {
        await other.eraseTx();
      }
    });
  });
});
