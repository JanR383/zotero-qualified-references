import { assert } from "chai";
import {
  addEntry,
  pruneItems,
  removedExternally,
  sanitizeJournal,
  type JournalEntry,
  type LineChange,
} from "../src/modules/journalLogic";

/** Pure tests for the change journal (S4) and removal detection (S5). */
describe("change journal logic", function () {
  const entry = (line: string, time = "2026-10-01T00:00:00.000Z") =>
    ({ time, line, count: 1 }) as JournalEntry;

  it("keeps the newest states first and at most the given depth", function () {
    let list: JournalEntry[] = [];
    for (const l of ["a", "b", "c"]) list = addEntry(list, entry(l), 2);
    assert.deepEqual(
      list.map((e) => e.line),
      ["c", "b"],
    );
  });

  it("does not repeat the newest state", function () {
    const list = addEntry([entry("a")], entry("a"));
    assert.lengthOf(list, 1);
  });

  it("drops the items changed longest ago", function () {
    const kept = pruneItems(
      {
        old: [entry("x", "2026-01-01T00:00:00.000Z")],
        mid: [entry("y", "2026-05-01T00:00:00.000Z")],
        new: [entry("z", "2026-09-01T00:00:00.000Z")],
      },
      2,
    );
    assert.sameMembers(Object.keys(kept), ["mid", "new"]);
  });

  it("drops malformed data read from disk", function () {
    const items = sanitizeJournal({
      items: {
        good: [entry("a"), { time: 1, line: "b", count: 1 }],
        bad: "nope",
      },
    });
    assert.deepEqual(Object.keys(items), ["good"]);
    assert.lengthOf(items.good, 1);
    assert.deepEqual(sanitizeJournal(null), {});
  });

  describe("removal by another tool", function () {
    const change = (c: Partial<LineChange>): LineChange => ({
      prev: '[{"id":"a"}]',
      next: null,
      prevCount: 1,
      nextCount: 0,
      own: false,
      undoableCreate: false,
      ...c,
    });

    it("is detected when the line disappears", function () {
      assert.isTrue(removedExternally(change({})));
    });

    it("is detected when the line becomes unreadable", function () {
      assert.isTrue(removedExternally(change({ next: "{broken" })));
    });

    it("is not reported for the plugin's own writes", function () {
      assert.isFalse(removedExternally(change({ own: true })));
    });

    it("is not reported for the empty line the plugin leaves", function () {
      assert.isFalse(removedExternally(change({ next: "[]" })));
    });

    it("is not reported when undo may have removed the line", function () {
      assert.isFalse(removedExternally(change({ undoableCreate: true })));
    });

    it("is not reported when references remain or there were none", function () {
      assert.isFalse(removedExternally(change({ next: "[]", nextCount: 1 })));
      assert.isFalse(removedExternally(change({ prevCount: 0 })));
    });
  });
});
