# Canonical terms (keep consistent across translations):
#   reference(s)     = an outgoing qualified link (DE: Bezug)
#   referenced by    = an incoming link (DE: Referenziert von)
#   stance           = the ++/+/0/−/−− rating (kept in all locales)
#   Source/Target p. = source/target page
section-head-text =
    .label = Qualified References
section-sidenav-tooltip =
    .tooltiptext = References
section-outgoing-title = References (this item → others)
section-incoming-title = Referenced by
add-button-label = + Add reference
add-incoming-button-label = + Add incoming reference
add-incoming-read-only = { $count ->
    [one] Skipped 1 item: its library is read-only.
   *[other] Skipped { $count } items: their library is read-only.
}
delete-button = Delete
field-source-pages = Source p.
field-target-pages = Target p.
field-comment = Comment
no-outgoing = No references yet.
no-incoming = Not referenced by any item.
missing-item = (item not found)
column-pos-label = Ref. (+)
column-neg-label = Ref. (−)
stance-pp = Strongly supporting
stance-p = Supporting
stance-0 = Neutral
stance-m = Contrasting
stance-mm = Strongly contrasting
menu-graph =
    .label = Reference Graph
menu-list =
    .label = Reference List
prefs-backup-title = Backup
prefs-backup-desc = Saves every qualified reference of all libraries to a JSON file with all fields. Restoring merges such a file back: missing references are added, later edits are kept, nothing is deleted.
prefs-backup-button =
    .label = Back Up…
prefs-restore-button =
    .label = Restore…
backup-title = Back up qualified references
backup-done = { $count ->
    [one] Backup saved: 1 reference.
   *[other] Backup saved: { $count } references.
}
backup-failed = The backup could not be saved. Details are in the debug output.
restore-title = Restore qualified references from a backup
restore-invalid = This file is not a backup of Qualified References.
restore-done = Restored: { $added } added, { $updated } updated in { $items } items.
restore-skipped = Skipped items: { $notFound } not found, { $readOnly } read-only, { $tooLarge } too large to sync.
restore-failed = The backup could not be restored. Details are in the debug output.
list-window-title = Qualified References – List
list-no-match = No matching entries.
list-search = Search title or author
list-expand-all = Expand all
list-collapse-all = Collapse all
list-sort = Sort order
list-sort-alpha = Alphabetical
list-sort-count = Number of references
list-sort-year = Year
list-open-pdf = ↗ PDF
list-open-pdf-title = Open the passage in the PDF
list-show-comment = Click to show the whole comment
graph-window-title = Qualified References – Graph
graph-empty = No references yet.
graph-type-other = Other
graph-out = References
graph-in = Referenced by
graph-legend = Legend
graph-controls = Controls
graph-link-distance = Edge length
graph-tags = Highlight tags
graph-tags-filter = Filter tags…
graph-tags-none = No tags in this scope.
graph-tag-focus = Only highlighted items and their neighbours
graph-layout-network = Network
graph-layout-timeline = Timeline
graph-layout-ego = Ego
graph-layout-layers = Layers
graph-layer-level = Level
graph-hint-network = Connected items attract each other; groups without shared references are kept apart.
graph-hint-timeline = Items by publication year from left to right; items without a year sit at the far right.
graph-hint-ego = One item in the centre: on the left half circle, items referring to it; on the right, items it refers to; at the top and bottom, mutual references. Faded on the outer ring: the next ring. Click an item, or search and press Enter, to put it in the centre.
graph-hint-layers = Items in layers by citation flow: level 0 cites none of the items shown; each higher level refers to items below it. Reference cycles are broken at one point.
graph-undated = n.d.
graph-search = Search items…
graph-search-depth2 = Include neighbours of neighbours
graph-filters = Filters
graph-filter-stances = Stances
graph-filter-types = Item types
graph-min-links = Min. references per item
graph-size-incoming = Size by incoming references
graph-link-open-pdf = Click: open the passage in the PDF
graph-link-select = Click: select the citing item
export = Export
export-title = Export references
export-csv = CSV (one row per reference)
export-graphml = GraphML (Gephi, Cytoscape)
export-png = Image (PNG)
export-md = Markdown
scope-label = Scope
scope-all = All libraries
scope-selection = Current selection in Zotero
prefs-title = Qualified References
prefs-palette-label = Stance colours
prefs-palette-default =
    .label = Default
prefs-palette-colorblind =
    .label = Colour-blind safe
prefs-stance-compact =
    .label = Compact stance setter (single pill with a menu)
prefs-edit-incoming =
    .label = Add and edit incoming references under “Referenced by”
prefs-comment-max = Maximum comment length (characters):
prefs-pane-title = Item pane and list window
prefs-pane-fields = Show items with:
prefs-graph-title = Graph window
prefs-graph-fields = Label nodes with:
prefs-graph-controls = Controls shown in the window:
prefs-graph-controls-desc = Hidden controls keep their default or last saved value: nodes stay sized by incoming references, the edge length stays as saved, and the graph opens as a network.
prefs-colors-title = Colours
prefs-field-author =
    .label = Author
prefs-field-year =
    .label = Year
prefs-field-title =
    .label = Title
prefs-graph-colorbytype =
    .label = Colour nodes by item type
prefs-graph-export-transparent =
    .label = Export PNG with a transparent background
prefs-graph-show-search =
    .label = Search
prefs-graph-show-filters =
    .label = Filters
prefs-graph-show-tags =
    .label = Tag highlighting
prefs-graph-show-size =
    .label = Size switch
prefs-graph-show-distance =
    .label = Edge length
prefs-graph-show-timeline =
    .label = Timeline
prefs-graph-show-ego =
    .label = Ego
prefs-graph-show-layers =
    .label = Layers
prefs-graph-views = Extra layouts besides the network:
prefs-reader-title = PDF reader
prefs-reader-selection-button =
    .label = Show a “Create qualified reference” button in the text-selection popup
prefs-privacy-title = Privacy
prefs-copy-refs-to-group =
    .label = Copy qualified references when adding an item to a group library
prefs-copy-refs-to-group-desc = Off (recommended): like Zotero's own “Related” links, references — including private comments and stances — are removed from the copy. On: they are kept and visible to everyone in the group.
anchor-open = ↗ Open in PDF (A)
anchor-missing = (highlight deleted)
anchor-page = p.
reader-add-ref = Add qualified reference from here…
reader-ref-created = Reference created
save-too-large = Not saved: this item's references would make its Extra field too large to sync. Shorten comments or remove references.
reader-groupcopy-stripped = Qualified references were not copied to the group (see Preferences → Privacy)

# Edit > Undo/Redo labels (Zotero 10); Zotero shows them as "Undo …"
undo-add-reference = { $count ->
    [one] Add Reference
   *[other] Add { $count } References
}
undo-edit-reference = Edit Reference
undo-delete-reference = Delete Reference
undo-restore-references = Restore References

# Change journal (S4) and removals by other tools (S5)
journal-title = { $count ->
    [one] Earlier state (1)
   *[other] Earlier states ({ $count })
}
journal-desc = Saved on this device only, before each change to this item's references.
journal-entry = { $count ->
    [one] Until { $time }: 1 reference
   *[other] Until { $time }: { $count } references
}
journal-restore = Restore
journal-dismiss = Dismiss
journal-banner = { $count ->
    [one] The reference of this item was removed outside Qualified References (for example by another tool or in the web library).
   *[other] The { $count } references of this item were removed outside Qualified References (for example by another tool or in the web library).
}
journal-removed-one = The references of “{ $title }” were removed outside Qualified References. They can be restored in the item pane.
journal-removed-many = The references of { $count } items were removed outside Qualified References. They can be restored in each item's pane.
