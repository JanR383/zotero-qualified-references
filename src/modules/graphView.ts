import { config } from "../../package.json";
import { getString } from "../utils/locale";
import {
  itemUri,
  openViewWindow,
  viewArgBase,
  type ItemFilter,
  viewStringsBase,
} from "./navigation";
import { zItemTypes } from "../utils/zoteroApis";
import { escapeHtml, truncate } from "../shared/text";
import { formatItem, graphFields, itemYear } from "./itemFormat";
import { TYPED_KEYS } from "./itemTypeColors";
import { STANCE_CSS_VAR, STANCE_GLYPH } from "./stanceMeta";
import { forEachResolvedLink } from "./storage";
import { collectTagOptions, loadTagColors } from "./tagHighlight";
import type { Stance } from "./types";
import type {
  GraphArg,
  GraphControlGroup,
  GraphData,
  GraphLink,
  GraphNode,
} from "../graph/types";

/**
 * Builds the reference graph from the in-memory reverse index
 * (addon.data.incomingIndex — no DB hit) and opens it in a standalone window.
 *
 * The window is opened with the same `openDialog` + `window.arguments` hand-off
 * used by src/modules/picker.ts (process-local, so the data object and the
 * selectItem callback cross the boundary directly).
 */

interface Edge {
  stance: Stance;
  id: number; // the *other* item's id
}

/** One coloured stance pill (glyph only) for the hover tooltip. */
function pill(stance: Stance): string {
  return (
    `<span style="display:inline-block;min-width:14px;text-align:center;` +
    `padding:0 5px;margin-right:5px;border-radius:8px;font-size:.8em;` +
    `background:var(${STANCE_CSS_VAR[stance]});color:var(--qref-stance-fg)">` +
    `${STANCE_GLYPH[stance]}</span>`
  );
}

/** Rows listing connected items (stance pill + formatted label), capped. */
function entryRows(
  edges: Edge[] | undefined,
  nodes: Map<number, GraphNode>,
): string {
  if (!edges || edges.length === 0) return "";
  const cap = 8;
  const sorted = edges.slice().sort((a, b) => b.stance - a.stance);
  const rows = sorted
    .slice(0, cap)
    .map((e) => {
      const label = escapeHtml(truncate(nodes.get(e.id)?.label ?? "", 50));
      return `<div style="margin:1px 0">${pill(e.stance)}${label}</div>`;
    })
    .join("");
  const more =
    sorted.length > cap
      ? `<div style="opacity:.55">… +${sorted.length - cap}</div>`
      : "";
  return rows + more;
}

/** A titled tooltip section; omitted entirely when there are no edges. */
function section(
  title: string,
  edges: Edge[] | undefined,
  nodes: Map<number, GraphNode>,
): string {
  const rows = entryRows(edges, nodes);
  if (!rows) return "";
  return (
    `<div style="font-size:.85em;opacity:.75;margin:6px 0 2px">${escapeHtml(title)}</div>` +
    rows
  );
}

function buildData(filter?: ItemFilter): GraphData {
  const nodes = new Map<number, GraphNode>();
  const items = new Map<number, Zotero.Item>();
  const links: GraphLink[] = [];
  const outEdges = new Map<number, Edge[]>(); // source id → targets
  const inEdges = new Map<number, Edge[]>(); // target id → sources
  const fields = graphFields();

  const push = (m: Map<number, Edge[]>, key: number, edge: Edge): void => {
    const arr = m.get(key);
    if (arr) arr.push(edge);
    else m.set(key, [edge]);
  };

  const ensureNode = (item: Zotero.Item): void => {
    if (!nodes.has(item.id)) {
      nodes.set(item.id, {
        id: item.id,
        label: formatItem(item, fields),
        itemType: item.itemType,
        year: itemYear(item),
        uri: itemUri(item),
        tooltip: "",
        tags: item.getTags().map((t) => t.tag),
      });
      items.set(item.id, item);
    }
  };

  forEachResolvedLink((source, target, link) => {
    ensureNode(source);
    ensureNode(target);
    links.push({
      id: link.id,
      source: source.id,
      target: target.id,
      stance: link.stance,
      comment: link.comment,
      sourcePages: link.sourcePages,
      targetPages: link.targetPages,
      hasAnchor: !!(link.sourceAttachmentKey && link.sourceAnnotationKey),
    });
    push(outEdges, source.id, { stance: link.stance, id: target.id });
    push(inEdges, target.id, { stance: link.stance, id: source.id });
  }, filter);

  for (const node of nodes.values()) {
    const item = items.get(node.id)!;
    const typeName = zItemTypes().getLocalizedString(item.itemType);
    node.tooltip =
      `<div style="max-width:380px">` +
      `<b>${escapeHtml(node.label)}</b>` +
      `<div style="opacity:.65;font-size:.85em;margin:1px 0 6px">${escapeHtml(typeName)}</div>` +
      section(`→ ${getString("graph-out")}`, outEdges.get(node.id), nodes) +
      section(`← ${getString("graph-in")}`, inEdges.get(node.id), nodes) +
      `</div>`;
  }

  // Type legend: present typed item types (localized) + "Other" if applicable.
  const present = new Set<string>();
  for (const item of items.values()) present.add(item.itemType);
  const typeLegend: { type: string; label: string }[] = [];
  for (const t of TYPED_KEYS) {
    if (present.has(t)) {
      typeLegend.push({
        type: t,
        label: zItemTypes().getLocalizedString(t),
      });
    }
  }
  if ([...present].some((t) => !TYPED_KEYS.includes(t as never))) {
    typeLegend.push({ type: "default", label: getString("graph-type-other") });
  }

  // Type filter (G2): every present type, localized, sorted by label.
  const itemTypes = [...present]
    .map((type) => ({ type, label: zItemTypes().getLocalizedString(type) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Tags offered for highlighting (G12): all tags present in this scope.
  const tagOptions = collectTagOptions(
    [...nodes.values()].map((n) => n.tags),
    loadTagColors(),
  );

  return {
    nodes: [...nodes.values()],
    links,
    typeLegend,
    itemTypes,
    tagOptions,
  };
}

const HIGHLIGHT_PREF = `${config.prefsPrefix}.graphHighlightTags`;

/** The tags selected for highlighting last time (lower-cased keys). */
function loadHighlightTags(): string[] {
  try {
    const v = JSON.parse(String(Zotero.Prefs.get(HIGHLIGHT_PREF, true) ?? ""));
    return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

const CONTROL_PREFS: Record<GraphControlGroup, string> = {
  search: "graphShowSearch",
  filters: "graphShowFilters",
  tags: "graphShowTags",
  size: "graphShowSizeToggle",
  distance: "graphShowLinkDistance",
  timeline: "graphShowTimeline",
};

/** Which optional control groups the graph window shows (prefs pane). */
function loadControls(): Record<GraphControlGroup, boolean> {
  const out = {} as Record<GraphControlGroup, boolean>;
  for (const [group, key] of Object.entries(CONTROL_PREFS)) {
    out[group as GraphControlGroup] =
      Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true) !== false;
  }
  return out;
}

export function openGraphView(win: Window): void {
  const { nodes, links, typeLegend, itemTypes, tagOptions } = buildData();
  const colorByType =
    Zotero.Prefs.get(`${config.prefsPrefix}.graphColorByType`, true) === true;
  const linkDistance = Number(
    Zotero.Prefs.get(`${config.prefsPrefix}.graphLinkDistance`, true) ?? 40,
  );
  const arg: GraphArg = {
    ...viewArgBase(buildData),
    nodes,
    links,
    strings: {
      ...viewStringsBase("graph-window-title"),
      linkDistance: getString("graph-link-distance"),
      search: getString("graph-search"),
      searchDepth2: getString("graph-search-depth2"),
      filters: getString("graph-filters"),
      filterStances: getString("graph-filter-stances"),
      filterTypes: getString("graph-filter-types"),
      minLinks: getString("graph-min-links"),
      sizeByIncoming: getString("graph-size-incoming"),
      sourcePages: getString("field-source-pages"),
      targetPages: getString("field-target-pages"),
      linkOpenPdf: getString("graph-link-open-pdf"),
      linkSelect: getString("graph-link-select"),
      tags: getString("graph-tags"),
      tagsFilter: getString("graph-tags-filter"),
      tagsNone: getString("graph-tags-none"),
      tagFocus: getString("graph-tag-focus"),
      layoutNetwork: getString("graph-layout-network"),
      layoutTimeline: getString("graph-layout-timeline"),
      undated: getString("graph-undated"),
      exportGraphml: getString("export-graphml"),
      exportPng: getString("export-png"),
    },
    colorByType,
    typeLegend,
    itemTypes,
    tagOptions,
    highlightTags: loadHighlightTags(),
    onHighlightTagsChange: (tags: string[]) => {
      Zotero.Prefs.set(HIGHLIGHT_PREF, JSON.stringify(tags), true);
    },
    linkDistance: Number.isFinite(linkDistance) ? linkDistance : 40,
    onLinkDistanceChange: (v: number) => {
      Zotero.Prefs.set(`${config.prefsPrefix}.graphLinkDistance`, v, true);
    },
    controls: loadControls(),
    exportTransparent: () =>
      Zotero.Prefs.get(`${config.prefsPrefix}.graphExportTransparent`, true) ===
      true,
  };

  openViewWindow(win, "graph", { width: 900, height: 700 }, arg);
}
