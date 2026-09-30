import { assert } from "chai";
import { filterNodes } from "../src/list/filter";
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
      outgoing: [{ stance: 2, id: 2, label: "Jones (2019): Ocean heat" }],
      incoming: [{ stance: -1, id: 3, label: "Brown (2021): A critique" }],
    },
    {
      id: 2,
      label: "Jones (2019): Ocean heat",
      outgoing: [],
      incoming: [{ stance: 2, id: 1, label: "Smith (2020): Climate models" }],
    },
    {
      id: 3,
      label: "Brown (2021): A critique",
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

  it("does not modify the input nodes", function () {
    filterNodes(nodes, "", new Set<Stance>());
    assert.lengthOf(nodes[0].incoming, 1);
  });
});
