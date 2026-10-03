import { assert } from "chai";
import {
  assignTagColors,
  collectTagOptions,
  mergeTagColors,
  orderTagOptions,
  ringColors,
  TAG_PALETTE,
  TAG_PALETTE_COLORBLIND,
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

    it("uses a picked palette slot over the Zotero colour", function () {
      const assigned = assignTagColors(
        ["#quelle", "alpha"],
        [{ name: "#Quelle", color: "#990000" }, { name: "Alpha" }],
        TAG_PALETTE_COLORBLIND,
        new Map([["#quelle", 3]]),
      );
      assert.equal(assigned.get("#quelle")!.color, TAG_PALETTE_COLORBLIND[3]);
      assert.equal(assigned.get("alpha")!.color, TAG_PALETTE_COLORBLIND[0]);
    });

    it("skips colours picked for other tags when assigning automatically", function () {
      const assigned = assignTagColors(
        ["a", "b"],
        [{ name: "a" }, { name: "b" }],
        TAG_PALETTE,
        new Map([["b", 0]]),
      );
      assert.equal(assigned.get("a")!.color, TAG_PALETTE[1]);
      assert.equal(assigned.get("b")!.color, TAG_PALETTE[0]);
    });

    it("offers six distinct colours in both palettes", function () {
      for (const palette of [TAG_PALETTE, TAG_PALETTE_COLORBLIND]) {
        assert.lengthOf(palette, 6);
        assert.lengthOf(new Set(palette), 6);
      }
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

  describe("orderTagOptions", function () {
    const options = [{ name: "Alpha" }, { name: "beta" }, { name: "Gamma" }];
    const names = (selected: string[]) =>
      orderTagOptions(options, selected).map((o) => o.name);

    it("lists selected tags first in selection order, the rest alphabetically", function () {
      assert.deepEqual(names(["gamma", "alpha"]), ["Gamma", "Alpha", "beta"]);
      assert.deepEqual(names([]), ["Alpha", "beta", "Gamma"]);
    });

    it("keeps a selected tag that no longer exists so it can be deselected", function () {
      // e.g. "Old" was renamed after it had been selected.
      const out = orderTagOptions(options, ["old", "beta"]);
      assert.deepEqual(out[0], { name: "old", key: "old", missing: true });
      assert.equal(out[1].name, "beta");
      assert.isUndefined(out[1].missing);
      assert.lengthOf(out, 4);
    });
  });
});
