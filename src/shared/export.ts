import type { Stance } from "../modules/types";

/**
 * File formats for exporting what the graph and list windows show (G8/L7).
 * Pure string builders, shared by both windows; writing the file is up to the
 * parent (see saveExport in modules/navigation.ts).
 */

export interface ExportItem {
  id: number;
  label: string;
  year: number | null;
  itemType?: string;
  /** zotero://select link, opens the item in Zotero. */
  uri: string;
}

export interface ExportRef {
  source: ExportItem;
  target: ExportItem;
  stance: Stance;
  comment?: string;
  sourcePages?: string;
  targetPages?: string;
}

export type ExportFormat = "csv" | "graphml" | "md" | "png";

/** One CSV field: quoted when it holds a comma, quote or line break. */
export function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = [
  "source",
  "source_year",
  "source_uri",
  "target",
  "target_year",
  "target_uri",
  "stance",
  "stance_label",
  "source_pages",
  "target_pages",
  "comment",
];

/**
 * One row per reference. Column names stay English so scripts and other tools
 * can rely on them; the stance is given as number and as localized name. The
 * byte order mark makes spreadsheet programs read the file as UTF-8.
 */
export function referencesCsv(
  refs: ExportRef[],
  stances: Record<Stance, string>,
): string {
  const rows = refs.map((r) =>
    [
      r.source.label,
      r.source.year,
      r.source.uri,
      r.target.label,
      r.target.year,
      r.target.uri,
      r.stance,
      stances[r.stance],
      r.sourcePages,
      r.targetPages,
      r.comment,
    ]
      .map(csvField)
      .join(","),
  );
  return "﻿" + [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function data(key: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<data key="${key}">${xml(String(value))}</data>`;
}

/**
 * GraphML for Gephi, Cytoscape and similar tools: the given items as nodes,
 * the references as directed edges with stance, pages and comment.
 */
export function referencesGraphml(
  items: ExportItem[],
  refs: ExportRef[],
  stances: Record<Stance, string>,
): string {
  const keys: [string, "node" | "edge", string, string][] = [
    ["label", "node", "label", "string"],
    ["year", "node", "year", "int"],
    ["itemType", "node", "itemType", "string"],
    ["uri", "node", "uri", "string"],
    ["stance", "edge", "stance", "int"],
    ["stanceLabel", "edge", "stance_label", "string"],
    ["sourcePages", "edge", "source_pages", "string"],
    ["targetPages", "edge", "target_pages", "string"],
    ["comment", "edge", "comment", "string"],
  ];
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<graphml xmlns="http://graphml.graphdrawing.org/xmlns">`,
    ...keys.map(
      ([id, kind, name, type]) =>
        `  <key id="${id}" for="${kind}" attr.name="${name}" attr.type="${type}"/>`,
    ),
    `  <graph id="qualified-references" edgedefault="directed">`,
    ...items.map(
      (n) =>
        `    <node id="n${n.id}">` +
        data("label", n.label) +
        data("year", n.year) +
        data("itemType", n.itemType) +
        data("uri", n.uri) +
        `</node>`,
    ),
    ...refs.map(
      (r, i) =>
        `    <edge id="e${i}" source="n${r.source.id}" target="n${r.target.id}">` +
        data("stance", r.stance) +
        data("stanceLabel", stances[r.stance]) +
        data("sourcePages", r.sourcePages) +
        data("targetPages", r.targetPages) +
        data("comment", r.comment) +
        `</edge>`,
    ),
    `  </graph>`,
    `</graphml>`,
    ``,
  ];
  return lines.join("\n");
}

export interface MarkdownStrings {
  title: string;
  outgoing: string;
  incoming: string;
  sourcePages: string;
  targetPages: string;
  stances: Record<Stance, string>;
}

/** Markdown has no escaping for plain text in a list; keep it to one line. */
function oneLine(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/** Link text: one line, brackets escaped so titles cannot break the link. */
function linkText(s: string): string {
  return oneLine(s).replace(/([[\]])/g, "\\$1");
}

function mdRef(
  r: ExportRef,
  other: ExportItem,
  strings: MarkdownStrings,
): string {
  const parts = [
    `**${strings.stances[r.stance]}:** [${linkText(other.label)}](${other.uri})`,
  ];
  const pages = [
    r.sourcePages ? `${strings.sourcePages} ${r.sourcePages}` : "",
    r.targetPages ? `${strings.targetPages} ${r.targetPages}` : "",
  ].filter(Boolean);
  if (pages.length) parts.push(`(${pages.join(", ")})`);
  if (r.comment) parts.push(`– ${oneLine(r.comment)}`);
  return `- ${parts.join(" ")}`;
}

/**
 * One section per item with its outgoing and incoming references, in the
 * given order (the list window's current sort), e.g. for a literature chapter.
 */
export function referencesMarkdown(
  items: ExportItem[],
  refs: ExportRef[],
  strings: MarkdownStrings,
): string {
  const out: string[] = [`# ${oneLine(strings.title)}`, ""];
  for (const item of items) {
    const outgoing = refs.filter((r) => r.source.id === item.id);
    const incoming = refs.filter((r) => r.target.id === item.id);
    if (outgoing.length === 0 && incoming.length === 0) continue;
    out.push(`## [${linkText(item.label)}](${item.uri})`, "");
    if (outgoing.length) {
      out.push(`### → ${strings.outgoing}`, "");
      for (const r of outgoing) out.push(mdRef(r, r.target, strings));
      out.push("");
    }
    if (incoming.length) {
      out.push(`### ← ${strings.incoming}`, "");
      for (const r of incoming) out.push(mdRef(r, r.source, strings));
      out.push("");
    }
  }
  return out.join("\n");
}
