import { assert } from "chai";
import { sortNodes, stanceCounts } from "../src/list/sort";
import type { ListNode } from "../src/list/types";

/**
 * Pure-function unit tests for the list window's sort order and stance
 * balance. No Zotero APIs are touched.
 */
describe("list sort", function () {
  const nodes: ListNode[] = [
    {
      id: 1,
      label: "Smith (2020): Climate models",
      year: 2020,
      outgoing: [{ stance: 2, id: 2, label: "Jones (2019): Ocean heat" }],
      incoming: [
        { stance: -1, id: 3, label: "Brown (2021): A critique" },
        { stance: 2, id: 4, label: "Undated note" },
      ],
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
    {
      id: 4,
      label: "Undated note",
      year: null,
      outgoing: [{ stance: 2, id: 1, label: "Smith (2020): Climate models" }],
      incoming: [],
    },
  ];
  const ids = (list: ListNode[]): number[] => list.map((n) => n.id);

  it("sorts alphabetically by label", function () {
    assert.deepEqual(ids(sortNodes(nodes, "alpha")), [3, 2, 1, 4]);
  });

  it("sorts by number of references, ties by label", function () {
    assert.deepEqual(ids(sortNodes(nodes, "count")), [1, 3, 2, 4]);
  });

  it("sorts by year, oldest first, undated last", function () {
    assert.deepEqual(ids(sortNodes(nodes, "year")), [2, 1, 3, 4]);
  });

  it("does not modify the input order", function () {
    sortNodes(nodes, "year");
    assert.deepEqual(ids(nodes), [1, 2, 3, 4]);
  });

  it("counts outgoing and incoming entries per stance", function () {
    assert.deepEqual(stanceCounts(nodes[0]), {
      2: 2,
      1: 0,
      0: 0,
      [-1]: 1,
      [-2]: 0,
    });
  });
});
