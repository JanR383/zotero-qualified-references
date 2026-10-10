import { assert } from "chai";
import { commentMatches, filterNodes } from "../src/list/filter";
import type { Stance } from "../src/modules/types";
import type { ListNode } from "../src/list/types";

/**
 * Pure-function unit tests for the list window's search and stance filter.
 * No Zotero APIs are touched.
 */
describe("list filter", function () {
  const nodes: ListNode[] = [
    {
      id: 1,
      label: "Smith (2020): Climate models",
      year: 2020,
      outgoing: [
        {
          stance: 2,
          id: 2,
          label: "Jones (2019): Ocean heat",
          comment: "Uses the buoy data",
        },
      ],
      incoming: [{ stance: -1, id: 3, label: "Brown (2021): A critique" }],
    },
    {
      id: 2,
      label: "Jones (2019): Ocean heat",
      year: 2019,
      outgoing: [],
      incoming: [{ stance: 2, id: 1, label: "Smith (2020): Climate models" }],
    },
    {
      id: 3,
      label: "Brown (2021): A critique",
      year: 2021,
      outgoing: [{ stance: -1, id: 1, label: "Smith (2020): Climate models" }],
      incoming: [],
    },
  ];
  const all = new Set<Stance>([2, 1, 0, -1, -2]);
  const ids = (list: ListNode[]): number[] => list.map((n) => n.id);

  it("returns every node for an empty query and all stances", function () {
    assert.deepEqual(ids(filterNodes(nodes, "  ", all)), [1, 2, 3]);
  });

  it("matches all terms case-insensitively against the label", function () {
    assert.deepEqual(ids(filterNodes(nodes, "smith 2020", all)), [1]);
    assert.deepEqual(ids(filterNodes(nodes, "OCEAN", all)), [2]);
    assert.deepEqual(ids(filterNodes(nodes, "smith 2019", all)), []);
  });

  it("drops entries of hidden stances and nodes left empty", function () {
    const result = filterNodes(nodes, "", new Set<Stance>([2]));
    assert.deepEqual(ids(result), [1, 2]);
    assert.lengthOf(result[0].incoming, 0);
    assert.lengthOf(result[0].outgoing, 1);
  });

  it("also matches comments, every term somewhere in the item", function () {
    assert.deepEqual(ids(filterNodes(nodes, "buoy", all)), [1]);
    assert.deepEqual(ids(filterNodes(nodes, "smith buoy", all)), [1]);
    assert.deepEqual(ids(filterNodes(nodes, "jones buoy", all)), []);
  });

  it("tells whether a comment contains a term", function () {
    assert.isTrue(commentMatches("Uses the buoy data", ["xyz", "buoy"]));
    assert.isFalse(commentMatches("Uses the buoy data", []));
    assert.isFalse(commentMatches(undefined, ["buoy"]));
  });

  it("shows items with or without own references", function () {
    assert.deepEqual(ids(filterNodes(nodes, "", all, "evaluated")), [1, 3]);
    assert.deepEqual(ids(filterNodes(nodes, "", all, "cited")), [2]);
  });

  describe("contested and unevaluated items", function () {
    const entry = (id: number, stance: Stance) => ({
      stance,
      id,
      label: `Item ${id}`,
    });
    const node = (incoming: ListNode["incoming"], outgoing = []) =>
      ({ id: 9, label: "Target", year: null, incoming, outgoing }) as never;

    it("decides the mode before the stance filter", function () {
      const contested = node([entry(1, 1), entry(2, -1)]);
      const onlyPos = new Set<Stance>([1]);
      assert.lengthOf(filterNodes([contested], "", onlyPos, "contested"), 1);
    });

    it("lists items cited by three works without own references", function () {
      const three = node([entry(1, 0), entry(2, 0), entry(3, 1)]);
      const twoWorks = node([entry(1, 0), entry(1, 1), entry(2, 1)]);
      assert.lengthOf(filterNodes([three], "", all, "unevaluated"), 1);
      assert.lengthOf(filterNodes([twoWorks], "", all, "unevaluated"), 0);
    });
  });

  it("shows items carrying a highlighted tag, case-insensitively", function () {
    const tagged = [
      { ...nodes[0], tags: ["#Quelle"] },
      { ...nodes[1], tags: ["other"] },
    ];
    const keys = new Set(["#quelle"]);
    assert.deepEqual(ids(filterNodes(tagged, "", all, "tagged", keys)), [1]);
    assert.deepEqual(ids(filterNodes(tagged, "", all, "tagged")), []);
  });

  it("does not modify the input nodes", function () {
    filterNodes(nodes, "", new Set<Stance>());
    assert.lengthOf(nodes[0].incoming, 1);
  });
});
