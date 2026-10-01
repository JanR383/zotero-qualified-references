import { assert } from "chai";
import {
  csvField,
  referencesCsv,
  referencesGraphml,
  referencesMarkdown,
  type ExportItem,
  type ExportRef,
} from "../src/shared/export";
import { listExportData } from "../src/list/exportData";
import type { ListNode } from "../src/list/types";
import type { Stance } from "../src/modules/types";

/** Pure tests for the export formats (G8/L7). */
describe("export", function () {
  const stances: Record<Stance, string> = {
    [-2]: "Strongly contrasting",
    [-1]: "Contrasting",
    0: "Neutral",
    1: "Supporting",
    2: "Strongly supporting",
  };
  const a: ExportItem = {
    id: 1,
    label: 'Smith, "Ideas" [draft]',
    year: 2001,
    itemType: "book",
    uri: "zotero://select/library/items/AAAA",
  };
  const b: ExportItem = {
    id: 2,
    label: "Doe <2010>",
    year: null,
    uri: "zotero://select/groups/7/items/BBBB",
  };
  const ref: ExportRef = {
    source: a,
    target: b,
    stance: -1,
    comment: "Disagrees,\nsee chapter 2",
    sourcePages: "12",
  };

  it("quotes CSV fields only when needed", function () {
    assert.equal(csvField("plain"), "plain");
    assert.equal(csvField('a "b", c'), '"a ""b"", c"');
    assert.equal(csvField(null), "");
    assert.equal(csvField(3), "3");
  });

  it("writes one CSV row per reference", function () {
    const lines = referencesCsv([ref], stances).split("\r\n");
    assert.isTrue(lines[0].startsWith("﻿source,source_year"));
    assert.equal(
      lines[1],
      '"Smith, ""Ideas"" [draft]",2001,zotero://select/library/items/AAAA,' +
        "Doe <2010>,,zotero://select/groups/7/items/BBBB,-1,Contrasting,12,," +
        '"Disagrees,\nsee chapter 2"',
    );
  });

  it("writes escaped GraphML with directed edges", function () {
    const xml = referencesGraphml([a, b], [ref], stances);
    assert.include(xml, 'edgedefault="directed"');
    assert.include(xml, '<data key="label">Doe &lt;2010&gt;</data>');
    assert.include(xml, '<edge id="e0" source="n1" target="n2">');
    assert.include(xml, '<data key="stance">-1</data>');
    assert.notInclude(xml, '<data key="year"></data>');
  });

  it("writes Markdown sections per item with both directions", function () {
    const md = referencesMarkdown([a, b], [ref], {
      title: "Qualified References",
      outgoing: "References",
      incoming: "Referenced by",
      sourcePages: "Source p.",
      targetPages: "Target p.",
      stances,
    });
    assert.include(
      md,
      '## [Smith, "Ideas" \\[draft\\]](zotero://select/library/items/AAAA)',
    );
    assert.include(
      md,
      "- **Contrasting:** [Doe <2010>](zotero://select/groups/7/items/BBBB)" +
        " (Source p. 12) – Disagrees, see chapter 2",
    );
    assert.include(md, "### ← Referenced by");
  });

  it("exports each reference of the visible list rows once", function () {
    const node = (id: number, label: string): ListNode => ({
      id,
      label,
      year: null,
      uri: `u${id}`,
      outgoing: [],
      incoming: [],
    });
    const n1 = node(1, "One");
    const n2 = node(2, "Two");
    const n3 = node(3, "Three");
    const entry = (id: number, label: string) => ({
      stance: 1 as Stance,
      id,
      label,
      linkId: "r1",
    });
    n1.outgoing.push(entry(2, "Two"));
    n2.incoming.push(entry(1, "One"));
    n3.incoming.push({ ...entry(2, "Two"), linkId: "r2" });
    n2.outgoing.push({ ...entry(3, "Three"), linkId: "r2" });
    const all = [n1, n2, n3];

    const both = listExportData([n1, n2], all);
    assert.deepEqual(
      both.items.map((i) => i.id),
      [1, 2],
    );
    assert.deepEqual(
      both.refs.map((r) => [r.source.id, r.target.id]),
      [
        [1, 2],
        [2, 3],
      ],
    );

    // A row filtered out still describes the other end of a shown reference.
    const one = listExportData([n3], all);
    assert.equal(one.refs[0].source.label, "Two");
  });
});
