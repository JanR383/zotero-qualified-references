import { assert } from "chai";
import { egoLayout, layerLevels } from "../src/graph/modes";

/** Pure tests for the ego-network and layered graph layouts. */
describe("graph ego and layer layouts", function () {
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
        { source: 5, target: 2 }, // 5 cites 2: outer ring, left
        { source: 3, target: 6 }, // 3 cites 6: outer ring, right
        { source: 7, target: 4 }, // 7 cites mutual 4: left by direction
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
    for (const id of [5, 7]) assert.isBelow(p.get(id)!.x, 0);
    assert.isAbove(p.get(6)!.x, 0);
    for (const id of [5, 6, 7]) {
      assert.equal(p.get(id)!.level, 2);
      assert.isTrue(near(r(id), 200));
    }
    assert.isFalse(p.has(8));
    assert.isFalse(p.has(9));
  });

  it("orders a side top to bottom and grows the ring to keep items apart", function () {
    const many = Array.from({ length: 30 }, (_, i) => i + 2);
    const p = egoLayout(
      1,
      many.map((id) => ({ source: id, target: 1 })),
      spacing,
      byId,
    );
    const ys = many.map((id) => p.get(id)!.y);
    assert.deepEqual(
      ys,
      [...ys].sort((a, b) => a - b),
    );
    for (let i = 1; i < many.length; i++) {
      const a = p.get(many[i - 1])!;
      const b = p.get(many[i])!;
      assert.isAbove(Math.hypot(a.x - b.x, a.y - b.y), 9.9 * 0.99);
    }
    // 30 items do not fit at radius 100 with 10 apart: the ring grew.
    assert.isAbove(Math.hypot(p.get(2)!.x, p.get(2)!.y), 100);
  });

  it("puts uncited items at the bottom and citing ones above", function () {
    const levels = layerLevels(
      [1, 2, 3, 4, 5],
      [
        { source: 1, target: 2 },
        { source: 2, target: 3 },
        { source: 1, target: 3 },
        { source: 4, target: 3 },
        { source: 1, target: 99 }, // outside the set: ignored
      ],
    );
    assert.deepEqual(
      [1, 2, 3, 4, 5].map((id) => levels.get(id)),
      [2, 1, 0, 1, 0],
    );
  });

  it("breaks reference cycles and still assigns every item a layer", function () {
    const levels = layerLevels(
      [1, 2, 3],
      [
        { source: 1, target: 2 },
        { source: 2, target: 3 },
        { source: 3, target: 1 },
        { source: 2, target: 2 },
      ],
    );
    assert.equal(levels.size, 3);
    // 3 → 1 closes the cycle and is dropped: 1 → 2 → 3.
    assert.deepEqual(
      [1, 2, 3].map((id) => levels.get(id)),
      [2, 1, 0],
    );
  });
});
