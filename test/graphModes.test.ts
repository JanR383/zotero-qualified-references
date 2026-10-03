import { assert } from "chai";
import { egoLayout, layerLevels } from "../src/graph/modes";

/** Pure tests for the ego-network and layered graph layouts. */
describe("graph ego and layer layouts", function () {
  const byId = (a: number, b: number) => a - b;
  const spacing = { column: 100, row: 10 };

  it("places citing items left, cited items right, mutual ones in the middle", function () {
    const p = egoLayout(
      1,
      [
        { source: 2, target: 1 }, // 2 cites the centre
        { source: 1, target: 3 }, // the centre cites 3
        { source: 1, target: 4 }, // mutual with 4
        { source: 4, target: 1 },
        { source: 5, target: 2 }, // 5 cites 2: second level, left
        { source: 3, target: 6 }, // 3 cites 6: second level, right
        { source: 7, target: 4 }, // 7 cites mutual 4: left by direction
        { source: 8, target: 9 }, // unrelated
      ],
      spacing,
      byId,
    );
    assert.deepEqual(p.get(1), { x: 0, y: 0, level: 0 });
    assert.deepEqual(p.get(2), { x: -100, y: 0, level: 1 });
    assert.deepEqual(p.get(3), { x: 100, y: 0, level: 1 });
    assert.deepEqual(p.get(4), { x: 0, y: -10, level: 1 });
    assert.deepEqual(p.get(5)?.x, -200);
    assert.deepEqual(p.get(6)?.x, 200);
    assert.deepEqual(p.get(7)?.x, -200);
    assert.equal(p.get(7)?.level, 2);
    assert.isFalse(p.has(8));
    assert.isFalse(p.has(9));
  });

  it("centres a column vertically in the given order", function () {
    const p = egoLayout(
      1,
      [
        { source: 4, target: 1 },
        { source: 2, target: 1 },
        { source: 3, target: 1 },
      ],
      spacing,
      byId,
    );
    assert.deepEqual(
      [2, 3, 4].map((id) => p.get(id)?.y),
      [-10, 0, 10],
    );
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
