import { assert } from "chai";
import { contestedIds, isContested } from "../src/shared/contested";
import type { Stance } from "../src/modules/types";

/** Pure-function unit tests for contested items (A1). */
describe("contested items", function () {
  const e = (id: number, stance: Stance) => ({ id, stance });

  it("needs a positive and a negative stance from two works", function () {
    assert.isTrue(isContested([e(1, 1), e(2, -2)]));
    assert.isFalse(isContested([e(1, 1), e(1, -1)]));
    assert.isFalse(isContested([e(1, 1), e(2, 0)]));
    assert.isTrue(isContested([e(1, 1), e(1, -1), e(2, 1)]));
  });

  it("finds the contested targets of a link list", function () {
    const links = [
      { source: 1, target: 9, stance: 1 as Stance },
      { source: 2, target: 9, stance: -1 as Stance },
      { source: 1, target: 8, stance: 1 as Stance },
      { source: 1, target: 8, stance: -1 as Stance },
    ];
    assert.deepEqual([...contestedIds(links)], [9]);
  });
});
