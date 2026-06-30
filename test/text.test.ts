import { assert } from "chai";
import { escapeHtml, truncate } from "../src/shared/text";

/**
 * Pure-function unit tests for the shared text helpers. No Zotero APIs are
 * touched, so these run independently of the live app.
 */
describe("text helpers", function () {
  describe("escapeHtml", function () {
    it("escapes the five HTML-significant characters", function () {
      assert.equal(
        escapeHtml(`<a href="x" title='y'>& done</a>`),
        "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp; done&lt;/a&gt;",
      );
    });

    it("leaves plain text untouched", function () {
      assert.equal(escapeHtml("Smith (2020): Title"), "Smith (2020): Title");
    });

    it("returns an empty string unchanged", function () {
      assert.equal(escapeHtml(""), "");
    });
  });

  describe("truncate", function () {
    it("collapses internal whitespace and trims", function () {
      assert.equal(truncate("  a   b \n c  ", 100), "a b c");
    });

    it("keeps text at or below the limit intact", function () {
      assert.equal(truncate("hello", 5), "hello");
    });

    it("appends an ellipsis when over the limit", function () {
      const out = truncate("abcdef", 4);
      assert.equal(out, "abc…");
      assert.lengthOf(out, 4);
    });
  });
});
