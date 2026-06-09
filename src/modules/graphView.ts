import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { formatItem, graphFields } from "./itemFormat";
import { TYPED_KEYS } from "./itemTypeColors";
import { getCurrentPaletteId, paletteOverrideCss } from "./stancePalette";
import type { Stance } from "./types";
import type { GraphArg, GraphLink, GraphNode } from "../graph/types";

/**
 * Builds the reference graph from the in-memory reverse index
 * (addon.data.incomingIndex — no DB hit) and opens it in a standalone window.
 *
 * The window is opened with the same `openDialog` + `window.arguments` hand-off
 * used by src/modules/picker.ts (process-local, so the data object and the
 * selectItem callback cross the boundary directly).
 */

const GLYPH: Record<Stance, string> = {
  2: "++",
  1: "+",
  0: "0",
  [-1]: "−",
  [-2]: "−−",
};

// CSS custom property per stance (resolved in the graph window where qref.css
// + the palette override are loaded). Used for the coloured tooltip pills (N4).
const STANCE_VAR: Record<Stance, string> = {
  2: "--qref-stance-strong-pos",
  1: "--qref-stance-pos",
  0: "--qref-stance-neutral",
  [-1]: "--qref-stance-neg",
  [-2]: "--qref-stance-strong-neg",
};

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

interface Edge {
  stance: Stance;
  id: number; // the *other* item's id
}

/** One coloured stance pill (glyph only). */
function pill(stance: Stance): string {
  return (
    `<span style="display:inline-block;min-width:14px;text-align:center;` +
    `padding:0 5px;margin-right:5px;border-radius:8px;font-size:.8em;` +
    `background:var(${STANCE_VAR[stance]});color:var(--qref-stance-fg)">` +
    `${GLYPH[stance]}</span>`
  );
}

/** Rows listing connected items (stance pill + formatted label), capped. */
function entryRows(
  edges: Edge[] | undefined,
  nodes: Map<number, GraphNode>,
): string {
  if (!edges || edges.length === 0) return `<div style="opacity:.55">–</div>`;
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

function buildData(): {
  nodes: GraphNode[];
  links: GraphLink[];
  typeLegend: { type: string; label: string }[];
} {
  const index = addon.data.incomingIndex;
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
        tooltip: "",
      });
      items.set(item.id, item);
    }
  };

  for (const list of index.values()) {
    for (const inc of list) {
      const source = Zotero.Items.get(inc.sourceID);
      const target = Zotero.Items.getByLibraryAndKey(
        inc.link.targetLib,
        inc.link.targetKey,
      );
      if (!source || !target) continue;
      ensureNode(source);
      ensureNode(target);
      const stance = inc.link.stance;
      links.push({ source: source.id, target: target.id, stance });
      push(outEdges, source.id, { stance, id: target.id });
      push(inEdges, target.id, { stance, id: source.id });
    }
  }

  for (const node of nodes.values()) {
    const item = items.get(node.id)!;
    const typeName = (Zotero as any).ItemTypes.getLocalizedString(
      item.itemType,
    );
    node.tooltip =
      `<div style="max-width:380px">` +
      `<b>${escapeHtml(node.label)}</b>` +
      `<div style="opacity:.65;font-size:.85em;margin:1px 0 6px">${escapeHtml(typeName)}</div>` +
      `<div style="font-size:.8em;opacity:.7;margin-bottom:1px">→ ${escapeHtml(getString("graph-out"))}</div>` +
      entryRows(outEdges.get(node.id), nodes) +
      `<div style="font-size:.8em;opacity:.7;margin:6px 0 1px">← ${escapeHtml(getString("graph-in"))}</div>` +
      entryRows(inEdges.get(node.id), nodes) +
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
        label: (Zotero as any).ItemTypes.getLocalizedString(t),
      });
    }
  }
  if ([...present].some((t) => !TYPED_KEYS.includes(t as never))) {
    typeLegend.push({ type: "default", label: getString("graph-type-other") });
  }

  return { nodes: [...nodes.values()], links, typeLegend };
}

export function openGraphView(win: Window): void {
  const { nodes, links, typeLegend } = buildData();
  const colorByType =
    Zotero.Prefs.get(`${config.prefsPrefix}.graphColorByType`, true) === true;
  const arg: GraphArg = {
    nodes,
    links,
    strings: {
      title: getString("graph-window-title"),
      empty: getString("graph-empty"),
      legend: {
        pp: getString("stance-pp"),
        p: getString("stance-p"),
        o: getString("stance-0"),
        m: getString("stance-m"),
        mm: getString("stance-mm"),
      },
    },
    selectItem: (id: number) => {
      Zotero.getActiveZoteroPane()?.selectItem(id);
    },
    paletteCss: paletteOverrideCss(getCurrentPaletteId()),
    colorByType,
    typeLegend,
  };

  (win as unknown as { openDialog: (...a: unknown[]) => void }).openDialog(
    "chrome://qref/content/graph.xhtml",
    "qref-graph",
    "chrome,resizable,centerscreen,width=900,height=700",
    arg,
  );
}
