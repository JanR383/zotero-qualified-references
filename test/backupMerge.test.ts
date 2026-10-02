import { assert } from "chai";
import { mergeLinks } from "../src/modules/backupMerge";
import type { ReferenceLink } from "../src/modules/types";

/** Pure tests for merging a backup into current references (S2). */
describe("backup merge", function () {
  const link = (id: string, modified: string, comment?: string) =>
    ({
      id,
      targetKey: "ABCD1234",
      targetLib: 1,
      stance: 1,
      comment,
      added: "2026-01-01T00:00:00.000Z",
      modified,
    }) as ReferenceLink;

  it("adds references the item no longer has", function () {
    const r = mergeLinks(
      [link("a", "2026-02-01T00:00:00.000Z")],
      [
        link("a", "2026-02-01T00:00:00.000Z"),
        link("b", "2026-01-05T00:00:00.000Z"),
      ],
    );
    assert.deepEqual(
      r.links.map((l) => l.id),
      ["a", "b"],
    );
    assert.equal(r.added, 1);
    assert.equal(r.updated, 0);
  });

  it("replaces a reference only with a later edit", function () {
    const current = [
      link("a", "2026-03-01T00:00:00.000Z", "current"),
      link("b", "2026-03-01T00:00:00.000Z", "current"),
    ];
    const r = mergeLinks(current, [
      link("a", "2026-02-01T00:00:00.000Z", "older"),
      link("b", "2026-04-01T00:00:00.000Z", "newer"),
    ]);
    assert.deepEqual(
      r.links.map((l) => l.comment),
      ["current", "newer"],
    );
    assert.equal(r.updated, 1);
    assert.equal(r.added, 0);
  });

  it("never deletes references missing from the backup", function () {
    const r = mergeLinks([link("a", "2026-02-01T00:00:00.000Z")], []);
    assert.lengthOf(r.links, 1);
    assert.equal(r.added + r.updated, 0);
  });

  it("adds a duplicated backup entry only once", function () {
    const b = link("x", "2026-02-01T00:00:00.000Z");
    const r = mergeLinks([], [b, { ...b }]);
    assert.lengthOf(r.links, 1);
    assert.equal(r.added, 1);
  });
});
