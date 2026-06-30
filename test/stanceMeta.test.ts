import { assert } from "chai";
import {
  STANCE_CSS_VAR,
  STANCE_GLYPH,
  STANCE_ORDER,
  stanceCssValue,
} from "../src/modules/stanceMeta";
import type { Stance } from "../src/modules/types";

/**
 * Pure-data unit tests for the stance presentation metadata. No Zotero APIs are
 * touched, so these run independently of the live app (they still execute in
 * the same `zotero-plugin test` harness as the integration suites).
 */
describe("stanceMeta", function () {
  const STANCES: Stance[] = [2, 1, 0, -1, -2];

  it("orders stances from strong-positive to strong-negative", function () {
    assert.deepEqual(STANCE_ORDER, [2, 1, 0, -1, -2]);
  });

  it("defines a glyph and a CSS variable for every stance", function () {
    for (const s of STANCES) {
      assert.isString(STANCE_GLYPH[s]);
      assert.isNotEmpty(STANCE_GLYPH[s]);
      assert.match(STANCE_CSS_VAR[s], /^--qref-stance-/);
    }
  });

  it("uses distinct glyphs and distinct CSS variables", function () {
    const glyphs = STANCES.map((s) => STANCE_GLYPH[s]);
    const vars = STANCES.map((s) => STANCE_CSS_VAR[s]);
    assert.lengthOf(new Set(glyphs), STANCES.length);
    assert.lengthOf(new Set(vars), STANCES.length);
  });

  it("wraps the stance variable in a CSS var() reference", function () {
    assert.equal(stanceCssValue(0), "var(--qref-stance-neutral)");
    assert.equal(stanceCssValue(-2), "var(--qref-stance-strong-neg)");
  });
});
