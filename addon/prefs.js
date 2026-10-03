// Default preferences. The scaffold prefixes these keys with the configured
// prefs prefix (extensions.zotero.qref) at build time.
pref("stancePalette", "default");

// Item display fields (N2): which of author / year / title to show, separately
// for the item pane + list ("references") and for the graph. Default: title
// only (matches the previous getDisplayTitle() behaviour).
pref("displayPaneAuthor", false);
pref("displayPaneYear", false);
pref("displayPaneTitle", true);
pref("displayGraphAuthor", false);
pref("displayGraphYear", false);
pref("displayGraphTitle", true);

// Graph: colour nodes by item type (N5).
pref("graphColorByType", true);

// Graph: export the PNG image with a transparent background instead of the
// window background (G8).
pref("graphExportTransparent", false);

// Graph: force-link distance (edge length) — adjustable via the in-window
// slider; larger values spread dense graphs out for legibility.
pref("graphLinkDistance", 40);

// Graph: tags selected for highlighting (G12), a JSON array of lower-cased tag
// names. Chosen in the graph window.
pref("graphHighlightTags", "[]");

// Graph: colour picked per highlighted tag, a JSON object of lower-cased tag
// name → slot (0–5) in the tag palette. Unset tags use their Zotero colour or
// the next free palette colour.
pref("graphHighlightColors", "{}");

// Graph window: which optional control groups to show. Scope is always shown;
// the search-depth checkbox appears only while a search term is entered.
pref("graphShowSearch", true);
pref("graphShowFilters", true);
pref("graphShowTags", true);
pref("graphShowSizeToggle", false);
pref("graphShowLinkDistance", false);
// Extra layouts besides the network, each switched on separately.
pref("graphShowTimeline", false);
pref("graphShowEgo", false);
pref("graphShowLayers", false);
// Graph window: legend and controls panel collapsed (remembered per profile).
pref("graphLegendCollapsed", false);
pref("graphControlsCollapsed", false);

// Reader: show a "create qualified reference" button in the PDF text-selection
// popup (anchors a reference to a highlight created on the fly).
pref("readerSelectionButton", true);

// Item pane: stance setter style. false (default) = segmented spectrum control
// (all five steps shown as one connected scale); true = compact single pill that
// opens a menu on click.
pref("stanceControlCompact", false);

// Item pane: add and edit incoming references under "Referenced by" (they are
// saved on the referencing item). false = the list is read-only.
pref("editIncoming", true);

// Item pane: maximum length of a reference comment typed in the pane. Keeps
// an item's references inside the sync size limit of Extra (clamped to
// 100–10000 when read).
pref("commentMaxLength", 2000);

// Privacy: copy qualified references along when an item is added to a group
// library? Default false — like Zotero's own "Related" links, references
// (incl. private comments/stance) are dropped so they aren't shared.
pref("copyRefsToGroup", false);
