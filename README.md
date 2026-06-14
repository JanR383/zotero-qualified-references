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

![Editing outgoing references in the item pane](docs/item-pane.png)

The target item shows a read-only **"Referenced by"** list of incoming links,
each with its stance, pages and a jump-back link.

![The read-only "Referenced by" view on a target item](docs/referenced-by.png)

Multiple references from A to B are allowed (e.g. supporting on p. 36,
contrasting on p. 90).

The **PDF anchor** is created straight from a highlight: right-click a passage
in the source item's PDF and choose _"Add qualified reference from here…"_.

![Creating a reference from a PDF highlight](docs/pdf-annotation-menu.png)

A **Tools → Reference Graph** window visualises the whole network: items as
nodes (shaped and coloured by item type), references as directed arrows
coloured by stance. A **Tools → Reference List** window shows the same data as
an expandable list.

![The reference graph window](docs/reference-graph.png)

![The reference list window](docs/reference-list.png)

## Data storage

Links are stored as a single line in the **source item's `Extra` field**:

```
Reference-Graph: [ { "id": ..., "targetKey": ..., "stance": -1, ... } ]
```

This syncs natively via Zotero's sync server. The reverse ("referenced by")
view is served by an in-memory index rebuilt at startup and kept fresh through
Zotero's notifier. All storage goes through `src/modules/storage.ts`, so the
backing store can be swapped later without touching the UI.

## Sync & data safety

How the Extra-field storage behaves with Zotero sync (verified against
Zotero's sync source, `syncLocal.js` / `extractExtraFields`):

- **Different fields, different devices → safe.** Zotero merges synced items
  with a three-way diff _per field_. Edits to other fields of the same item
  never touch the `Reference-Graph:` line.
- **Same item's references edited on two devices before syncing → conflict.**
  The whole `Extra` field is one unit: Zotero shows its conflict dialog and the
  side you discard loses its reference changes (there is no line-level merge).
  _Recommendation:_ edit a given item's references on one device at a time; in
  the conflict dialog, the `Reference-Graph:` line is visible — when in doubt,
  keep the side with the longer line, then re-add the missing reference.
- **No auto-conversion.** Zotero only converts known field names / CSL
  variables out of Extra (`Type:` etc.); `Reference-Graph` matches none of
  them and is left untouched.
- **Coexistence.** The plugin parses Extra line-by-line and preserves all
  other lines (covered by tests). Third-party tools that _replace_ the whole
  Extra field would, however, also wipe this line.
- **Export side-effect.** BibTeX/BibLaTeX export maps Extra to the `note`
  field, so the JSON line appears there; CSL citations ignore unknown keys.
- **Notifier resilience.** Each incoming sync notification is processed
  individually inside a try/catch so that one unloadable item (e.g. during a
  large batch sync) cannot abort the reverse-index update for the rest of the
  batch.
- **Copying into a group library.** When you copy an item that carries
  references into a group library, the references — including your private
  comments and stance ratings — are **not** copied by default, mirroring how
  Zotero itself drops "Related" links across libraries. This is controlled by
  **Settings → Privacy** (see below) and can be turned on if you do want to
  share them with the group.

## Settings

Open **Zotero → Settings → Qualified References**. You can choose the stance
colour palette (default or colour-blind safe), which fields (author / year /
title) appear in the references list and in the graph, whether graph nodes are
coloured by item type, and the **Privacy** option for copying references into
group libraries (off by default).

![The plugin's settings pane](docs/preferences.png)

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
  (AGPL-3.0-or-later) & **[zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)**
  (MIT) by windingwind — project scaffold, build pipeline and UI/menu helpers.
  The toolkit is bundled into the main script; its full licence text ships in
  `THIRD-PARTY-LICENSES.md` inside the plugin.
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
- **Item-type colours** — the graph's node colours per item type
  (`src/modules/itemTypeColors.ts`) are taken from the
  [Open Color](https://yeun.github.io/open-color/) palette (MIT).

This plugin is licensed under **AGPL-3.0-or-later** (see `LICENSE`). While the
repository is private, the complete corresponding source is available on
request to anyone who receives the `.xpi`.
