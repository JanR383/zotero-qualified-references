import { assert } from "chai";
import { timeScale } from "../src/graph/timeline";

/** Pure tests for the timeline layout's year scale (G11). */
describe("graph timeline scale", function () {
  it("orders years left to right and keeps the span readable", function () {
    const s = timeScale([2000, 2010, 2020]);
    assert.isBelow(s.x(2000), s.x(2010));
    assert.isBelow(s.x(2010), s.x(2020));
    assert.approximately(s.x(2010), 0, 1e-9); // centred on the middle year
    assert.approximately(s.x(2020) - s.x(2000), 1000, 1e-9);
  });

  it("caps the spacing for a short span and keeps ticks apart", function () {
    const s = timeScale([2019, 2020]);
    assert.equal(s.x(2020) - s.x(2019), 120);
    const long = timeScale([1800, 2020]);
    const gaps = long.ticks.slice(1).map((t, i) => t.x - long.ticks[i].x);
    assert.isTrue(gaps.every((g) => g >= 60));
    assert.isTrue(long.ticks.every((t) => t.year % 10 === 0));
  });

  it("puts undated items in a lane right of the newest year", function () {
    const s = timeScale([1990, null, 2000]);
    assert.isNotNull(s.undatedX);
    assert.isAbove(s.undatedX!, s.x(2000));
    assert.equal(s.x(null), s.undatedX);
    assert.isNull(timeScale([1990, 2000]).undatedX);
  });

  it("handles only undated items or a single year", function () {
    const none = timeScale([null, null]);
    assert.equal(none.x(null), 0);
    assert.deepEqual(none.ticks, []);
    const one = timeScale([2005]);
    assert.equal(one.x(2005), 0);
    assert.deepEqual(
      one.ticks.map((t) => t.year),
      [2005],
    );
  });
});
