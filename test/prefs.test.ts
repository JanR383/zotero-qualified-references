import { assert } from "chai";
import { config } from "../package.json";

/**
 * Regression tests for preference lookups.
 *
 * `Zotero.Prefs.get(pref, global)` takes a *global* flag as its second
 * parameter, not a default value. Our keys are fully qualified with
 * config.prefsPrefix, so every call must pass `true`; passing `false` makes
 * Zotero prepend "extensions.zotero." a second time, the lookup misses and
 * returns undefined. That bug made the copyRefsToGroup opt-in ineffective
 * (references were always stripped on group copies).
 */
describe("prefs", function () {
  it("resolves copyRefsToGroup with the global flag (regression)", function () {
    const value = Zotero.Prefs.get(
      `${config.prefsPrefix}.copyRefsToGroup`,
      true,
    );
    // The prefs.js default must be found — undefined means the lookup went to
    // the wrong branch (the exact failure mode of the fixed bug).
    assert.isBoolean(value);
  });

  it("returns undefined for a doubly-prefixed key (documents the failure mode)", function () {
    const value = Zotero.Prefs.get(
      `extensions.zotero.${config.prefsPrefix}.copyRefsToGroup`,
      true,
    );
    assert.isUndefined(value);
  });
});
