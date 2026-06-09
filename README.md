# Qualified References (Zotero 9 plugin)

> ⚠️ **Note:** This plugin was largely "vibe-coded" with **Claude Opus 4.8**. It
> may contain bugs or rough edges — use at your own discretion, and please
> report issues.

Adds **directed, qualified references** between Zotero items — beyond Zotero's
plain, undirected "Related" links. In an item's right-hand pane you can link to
one or more other items, each with:

- optional **source** and **target page numbers**,
- a 5-point **stance** (`++ + 0 − −−`),
- a free-text **comment**,
- an optional **PDF anchor** — right-click a highlight in the source item's PDF
  to create the reference; its page number is filled in automatically and you
  can jump back to the passage from either side.

The target item shows a read-only **"Referenced by"** list of incoming links.

Multiple references from A to B are allowed (e.g. supporting on p. 36,
contrasting on p. 90).

A **Tools → Reference Graph** window visualises the whole network: items as
nodes, references as directed arrows coloured by stance.

## Data storage

Links are stored as a single line in the **source item's `Extra` field**:

```
Reference-Graph: [ { "id": ..., "targetKey": ..., "stance": -1, ... } ]
```

This syncs natively via Zotero's sync server. The reverse ("referenced by")
view is served by an in-memory index rebuilt at startup and kept fresh through
Zotero's notifier. All storage goes through `src/modules/storage.ts`, so the
backing store can be swapped later without touching the UI.

## Installation

Requires **Zotero 9** or newer.

1. Download the latest `.xpi` from the [Releases](https://github.com/JanR383/zotero-qualified-references/releases) page.
2. In Zotero: **Tools → Plugins → ⚙ (gear) → Install Plugin From File…** and select the `.xpi`.
3. Restart Zotero.

> **Note:** This repository is currently **private**, so Zotero's automatic
> update check cannot reach the release assets — update by installing a newer
> `.xpi` manually. Auto-updates start working once the repository is made public.

## Development

```bash
npm install
cp .env.example .env   # point to a DEDICATED dev Zotero profile
npm start              # side-load + hot-reload in Zotero
npm run build          # produce .scaffold/build/*.xpi
```

Built on the [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)
stack (TypeScript, `zotero-plugin-scaffold`, `zotero-plugin-toolkit`,
`zotero-types`).

## Acknowledgements / Third-party

This project reuses the following libraries, code patterns and design sources:

- **[force-graph](https://github.com/vasturiano/force-graph)** by Vasco Asturiano
  (MIT) — renders the reference-graph window. Bundled locally; its and its
  dependencies' licence notices are preserved in
  `content/scripts/graph.js.LEGAL.txt`.
- **[zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)**
  & **[zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)**
  by windingwind — project scaffold, build pipeline and UI/menu helpers.
- **Window pattern** — opening the graph via `openDialog` + `window.arguments`
  follows Zotero's own `selectItemsDialog.xhtml` (mirrored in
  `src/modules/picker.ts`).
- **PDF anchors** — the reader integration uses
  `Zotero.Reader.registerEventListener("createAnnotationContextMenu", …)`;
  jumping to an annotation uses `Zotero.Reader.open(id, { annotationID })`, the
  same `location` Zotero's `zotero://open-pdf` handler builds.
- **Zotero source patterns** (reverse-engineered from `omni.ja`) — the section
  header FTL attribute syntax (`.label` / `.tooltiptext`), the
  `collapsible-section` title binding, and `MozXULElement.insertFTLIfNeeded`
  for synchronous l10n resource loading.
- **Stance colours** — the default green→red palette in `addon/content/qref.css`
  is based on the [GitHub Primer](https://primer.style/) success/danger/neutral
  scales (contrast-checked for light and dark mode). The optional colour-blind
  safe palette (Preferences → Stance colours) uses the
  [Okabe–Ito palette](https://jfly.uni-koeln.de/color/) (blue ↔ orange/vermillion).
