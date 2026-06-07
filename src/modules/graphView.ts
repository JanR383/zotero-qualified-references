import { getString } from "../utils/locale";
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

const STANCE_ORDER: Stance[] = [2, 1, 0, -1, -2];

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
  );
}

function bump(
  counts: Map<number, Map<Stance, number>>,
  id: number,
  stance: Stance,
): void {
  let inner = counts.get(id);
  if (!inner) {
    inner = new Map();
    counts.set(id, inner);
  }
  inner.set(stance, (inner.get(stance) ?? 0) + 1);
}

function formatCounts(counts?: Map<Stance, number>): string {
  if (!counts || counts.size === 0) return "–";
  return STANCE_ORDER.filter((s) => counts.get(s))
    .map((s) => `${GLYPH[s]}×${counts.get(s)}`)
    .join("  ");
}

function buildData(): { nodes: GraphNode[]; links: GraphLink[] } {
  const index = addon.data.incomingIndex;
  const nodes = new Map<number, GraphNode>();
  const links: GraphLink[] = [];
  const outCounts = new Map<number, Map<Stance, number>>();
  const inCounts = new Map<number, Map<Stance, number>>();

  const ensureNode = (item: Zotero.Item): void => {
    if (!nodes.has(item.id)) {
      nodes.set(item.id, {
        id: item.id,
        label: item.getDisplayTitle(),
        tooltip: "",
      });
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
      bump(outCounts, source.id, stance);
      bump(inCounts, target.id, stance);
    }
  }

  for (const node of nodes.values()) {
    node.tooltip =
      `<b>${escapeHtml(node.label)}</b><br/>` +
      `→ ${formatCounts(outCounts.get(node.id))}<br/>` +
      `← ${formatCounts(inCounts.get(node.id))}`;
  }

  return { nodes: [...nodes.values()], links };
}

export function openGraphView(win: Window): void {
  const { nodes, links } = buildData();
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
  };

  (win as unknown as { openDialog: (...a: unknown[]) => void }).openDialog(
    "chrome://qref/content/graph.xhtml",
    "qref-graph",
    "chrome,resizable,centerscreen,width=900,height=700",
    arg,
  );
}
