import { assert } from "chai";
import { egoLayout } from "../src/graph/modes";

/** Pure tests for the ego-network graph layout. */
describe("graph ego layout", function () {
  const byId = (a: number, b: number) => a - b;

  const spacing = { ring: 100, gap: 10 };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  it("places citing items left, cited items right, mutual ones at the poles", function () {
    const p = egoLayout(
      1,
      [
        { source: 2, target: 1 }, // 2 cites the centre
        { source: 1, target: 3 }, // the centre cites 3
        { source: 1, target: 4 }, // mutual with 4
        { source: 4, target: 1 },
        { source: 5, target: 2 }, // 5 cites 2 and 4: outer ring, left
        { source: 5, target: 4 },
        { source: 3, target: 6 }, // 3 and 4 cite 6: outer ring, right
        { source: 4, target: 6 },
        { source: 7, target: 4 }, // 7 hangs on one neighbour only: left out
        { source: 8, target: 9 }, // unrelated
      ],
      spacing,
      byId,
    );
    const r = (id: number) => Math.hypot(p.get(id)!.x, p.get(id)!.y);
    assert.deepEqual(p.get(1), { x: 0, y: 0, level: 0 });
    // A single item on a side sits level with the centre.
    assert.isTrue(near(p.get(2)!.x, -100) && near(p.get(2)!.y, 0));
    assert.isTrue(near(p.get(3)!.x, 100) && near(p.get(3)!.y, 0));
    assert.isTrue(near(p.get(4)!.x, 0) && near(p.get(4)!.y, -100));
    assert.isBelow(p.get(5)!.x, 0);
    assert.isAbove(p.get(6)!.x, 0);
    for (const id of [5, 6]) {
      assert.equal(p.get(id)!.level, 2);
      assert.isTrue(near(r(id), 200));
    }
    for (const id of [7, 8, 9]) assert.isFalse(p.has(id));
  });

  it("spreads neighbours in one direction over both half circles", function () {
    const p = egoLayout(
      1,
      [2, 3, 4, 5].map((id) => ({ source: 1, target: id })),
      spacing,
      byId,
    );
    // Clockwise from the top: 2, 3 on the right, 4, 5 on the left.
    assert.isAbove(p.get(2)!.x, 0);
    assert.isAbove(p.get(3)!.x, 0);
    assert.isBelow(p.get(2)!.y, p.get(3)!.y);
    assert.isBelow(p.get(4)!.x, 0);
    assert.isBelow(p.get(5)!.x, 0);
    assert.isAbove(p.get(4)!.y, p.get(5)!.y);
  });

  it("orders a side top to bottom and grows the ring to keep items apart", function () {
    const many = Array.from({ length: 30 }, (_, i) => i + 2);
    const p = egoLayout(
      1,
      [
        ...many.map((id) => ({ source: id, target: 1 })),
        { source: 1, target: 99 }, // one cited item keeps the rest left
      ],
      spacing,
      byId,
    );
    const ys = many.map((id) => p.get(id)!.y);
    assert.deepEqual(
      ys,
      [...ys].sort((a, b) => a - b),
    );
    // Evenly spaced in height, so labels beside the items do not overlap.
    for (let i = 1; i < many.length; i++) {
      const a = p.get(many[i - 1])!;
      const b = p.get(many[i])!;
      assert.isAbove(b.y - a.y, 10 * 0.99);
    }
    // 30 items do not fit at radius 100 with 10 apart: the ring grew.
    assert.isAbove(Math.hypot(p.get(2)!.x, p.get(2)!.y), 100);
  });
});
