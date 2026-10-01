import { assert } from "chai";
import { LabelBoxes, estimateLabelWidth, overlaps } from "../src/graph/labels";

/** Pure tests for graph label collision handling. */
describe("graph labels", function () {
  it("detects overlapping and touching boxes", function () {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    assert.isTrue(overlaps(a, { x: 5, y: 5, w: 10, h: 10 }));
    assert.isFalse(overlaps(a, { x: 10, y: 0, w: 10, h: 10 }));
    assert.isFalse(overlaps(a, { x: 0, y: 11, w: 10, h: 10 }));
  });

  it("claims free space and refuses taken space until reset", function () {
    const boxes = new LabelBoxes();
    assert.isTrue(boxes.claim({ x: 0, y: 0, w: 100, h: 12 }));
    assert.isFalse(boxes.claim({ x: 50, y: 6, w: 100, h: 12 }));
    assert.isTrue(boxes.claim({ x: 0, y: 20, w: 100, h: 12 }));
    boxes.reset();
    assert.isTrue(boxes.claim({ x: 50, y: 6, w: 100, h: 12 }));
  });

  it("lets forced labels block later ones", function () {
    const boxes = new LabelBoxes();
    boxes.force({ x: 0, y: 0, w: 50, h: 12 });
    assert.isFalse(boxes.claim({ x: 10, y: 0, w: 50, h: 12 }));
  });

  it("estimates width from the visible text, capped like the label", function () {
    assert.equal(estimateLabelWidth("abcd"), 26);
    assert.equal(estimateLabelWidth("x".repeat(100)), 260);
  });
});
