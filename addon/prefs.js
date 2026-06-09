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
