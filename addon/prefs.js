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

// Graph: force-link distance (edge length) — adjustable via the in-window
// slider; larger values spread dense graphs out for legibility.
pref("graphLinkDistance", 40);

// Reader: show a "create qualified reference" button in the PDF text-selection
// popup (anchors a reference to a highlight created on the fly).
pref("readerSelectionButton", true);

// Privacy: copy qualified references along when an item is added to a group
// library? Default false — like Zotero's own "Related" links, references
// (incl. private comments/stance) are dropped so they aren't shared.
pref("copyRefsToGroup", false);
