import { assert } from "chai";
import {
  computeView,
  matchesQuery,
  sizeFactor,
  type ViewFilters,
  type ViewLink,
  type ViewNode,
} from "../src/graph/view";
import { STANCE_ORDER } from "../src/modules/stanceMeta";
import type { Stance } from "../src/modules/types";

/**
 * Pure-function tests for the graph window's filters, label hubs, node size
 * and search focus (G1, G2, G4, G5). No Zotero APIs are touched.
 */
describe("graph view logic", function () {
  // 1 → 2 → 3 → 4, plus 5 → 2 (contrasting); 6 is a book citing 2.
  const nodes: ViewNode[] = [
    {
      id: 1,
      label: "Smith (2020): Climate models",
      itemType: "journalArticle",
    },
    { id: 2, label: "Jones (2019): Ocean heat", itemType: "journalArticle" },
    { id: 3, label: "Brown (2021): A critique", itemType: "journalArticle" },
    { id: 4, label: "Lee (2018): Ice cores", itemType: "journalArticle" },
    { id: 5, label: "Kim (2022): Rebuttal", itemType: "journalArticle" },
    { id: 6, label: "Doe (2015): Handbook", itemType: "book" },
  ];
  const links: ViewLink[] = [
    { source: 1, target: 2, stance: 2 },
    { source: 2, target: 3, stance: 1 },
    { source: 3, target: 4, stance: 0 },
    { source: 5, target: 2, stance: -2 },
    { source: 6, target: 2, stance: 1 },
  ];
  const base = (patch: Partial<ViewFilters> = {}): ViewFilters => ({
    stances: new Set<Stance>(STANCE_ORDER),
    types: new Set(["journalArticle", "book"]),
    minLinks: 1,
    focusOn: null,
    query: "",
    depth: 1,
    ...patch,
  });
  const ids = (s: Set<number> | null) => [...(s ?? [])].sort();

  it("shows every connected node without filters", function () {
    const v = computeView(nodes, links, base());
    assert.deepEqual(ids(v.visible), [1, 2, 3, 4, 5, 6]);
    assert.equal(v.degree.get(2), 4);
    assert.equal(v.incoming.get(2), 3);
    assert.isNull(v.hits);
  });

  it("hides nodes left without links by the stance filter", function () {
    const v = computeView(nodes, links, base({ stances: new Set([2, 1]) }));
    // 5 only had a −− link; 4 only a neutral one.
    assert.deepEqual(ids(v.visible), [1, 2, 3, 6]);
  });

  it("filters by item type", function () {
    const v = computeView(
      nodes,
      links,
      base({ types: new Set(["journalArticle"]) }),
    );
    assert.notInclude([...v.visible], 6);
    assert.equal(v.incoming.get(2), 2);
  });

  it("keeps only nodes with at least n references", function () {
    const v = computeView(nodes, links, base({ minLinks: 2 }));
    // Only 2 (4 links) and 3 (2 links) pass; the link between them remains.
    assert.deepEqual(ids(v.visible), [2, 3]);
  });

  it("limits the tag focus to highlighted nodes and their neighbours", function () {
    const v = computeView(nodes, links, base({ focusOn: new Set([4]) }));
    assert.deepEqual(ids(v.visible), [3, 4]);
  });

  it("marks the most connected nodes as hubs", function () {
    const v = computeView(nodes, links, base());
    assert.deepEqual(ids(v.hubs), [2]);
  });

  it("finds search hits and widens the focus by one or two steps", function () {
    const one = computeView(nodes, links, base({ query: "critique" }));
    assert.deepEqual(ids(one.hits), [3]);
    assert.deepEqual(ids(one.focus), [2, 3, 4]);
    const two = computeView(
      nodes,
      links,
      base({ query: "critique", depth: 2 }),
    );
    assert.deepEqual(ids(two.focus), [1, 2, 3, 4, 5, 6]);
  });

  it("matches all terms case-insensitively and nothing for an empty query", function () {
    assert.isTrue(matchesQuery("Smith (2020): Climate models", "smith 2020"));
    assert.isFalse(matchesQuery("Smith (2020): Climate models", "smith 2021"));
    assert.isFalse(matchesQuery("Smith", "   "));
  });

  it("grows nodes with incoming references, capped", function () {
    assert.equal(sizeFactor(0), 1);
    assert.isAbove(sizeFactor(4), sizeFactor(1));
    assert.equal(sizeFactor(1000), 2.2);
  });
});
