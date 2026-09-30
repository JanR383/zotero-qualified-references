import { assert } from "chai";
import {
  assignTagColors,
  collectTagOptions,
  mergeTagColors,
  ringColors,
} from "../src/modules/tagHighlight";

/**
 * Pure-function unit tests for tag highlighting in the graph (G12). No Zotero
 * APIs are touched.
 */
describe("tag highlighting", function () {
  const colors = (entries: [string, string][]) =>
    new Map(
      entries.map(([name, color], position) => [name, { color, position }]),
    );

  describe("mergeTagColors", function () {
    it("keys by lower-cased name, earlier library wins a conflict", function () {
      const merged = mergeTagColors([
        colors([["#Quelle", "#111111"]]),
        colors([
          ["#quelle", "#222222"],
          ["Wichtig", "#333333"],
        ]),
      ]);
      assert.equal(merged.get("#quelle"), "#111111");
      assert.equal(merged.get("wichtig"), "#333333");
    });
  });

  describe("collectTagOptions", function () {
    it("dedupes case-insensitively, sorts by name, attaches Zotero colours", function () {
      const options = collectTagOptions(
        [
          ["zeta", "#Quelle"],
          ["#quelle", "Alpha"],
        ],
        new Map([["#quelle", "#990000"]]),
      );
      assert.deepEqual(options, [
        { name: "#Quelle", color: "#990000" },
        { name: "Alpha" },
        { name: "zeta" },
      ]);
    });
  });

  describe("assignTagColors", function () {
    it("uses the Zotero colour, else the palette, in selection order", function () {
      const options = [
        { name: "#Quelle", color: "#990000" },
        { name: "Alpha" },
      ];
      const assigned = assignTagColors(
        ["alpha", "#quelle", "missing"],
        options,
      );
      assert.deepEqual([...assigned.keys()], ["alpha", "#quelle"]);
      assert.equal(assigned.get("#quelle")!.color, "#990000");
      assert.match(assigned.get("alpha")!.color, /^#[0-9a-f]{6}$/);
    });

    it("gives uncoloured tags distinct palette colours", function () {
      const assigned = assignTagColors(
        ["a", "b"],
        [{ name: "a" }, { name: "b" }],
      );
      assert.notEqual(assigned.get("a")!.color, assigned.get("b")!.color);
    });
  });

  describe("ringColors", function () {
    it("returns one colour per matching selected tag, in legend order", function () {
      const assigned = new Map([
        ["#quelle", { color: "#990000" }],
        ["alpha", { color: "#00aa00" }],
      ]);
      assert.deepEqual(ringColors(["Alpha", "#QUELLE", "other"], assigned), [
        "#990000",
        "#00aa00",
      ]);
      assert.deepEqual(ringColors(["other"], assigned), []);
    });
  });
});
