# Kanonische Begriffe (für künftige Übersetzungen konsistent halten):
#   Bezug / Bezüge        = ausgehender qualifizierter Link (EN: reference)
#   Referenziert von      = eingehender Link (EN: referenced by)
#   Stance                = die ++/+/0/−/−− Bewertung (Anglizismus, bleibt)
#   Quelle/Ziel S.        = source/target page
section-head-text =
    .label = Qualifizierte Referenzen
section-sidenav-tooltip =
    .tooltiptext = Referenzen
section-outgoing-title = Bezüge (dieser Eintrag → andere)
section-incoming-title = Referenziert von
add-button-label = + Bezug hinzufügen
add-incoming-button-label = + Eingehenden Bezug hinzufügen
add-incoming-read-only = { $count ->
    [one] 1 Eintrag übersprungen: Seine Bibliothek ist schreibgeschützt.
   *[other] { $count } Einträge übersprungen: Ihre Bibliothek ist schreibgeschützt.
}
delete-button = Löschen
field-source-pages = Quelle S.
field-target-pages = Ziel S.
field-comment = Kommentar
no-outgoing = Noch keine Bezüge.
no-incoming = Von keinem Eintrag referenziert.
missing-item = (Eintrag nicht gefunden)
column-pos-label = Ref. (+)
column-neg-label = Ref. (−)
stance-pp = Stark zustimmend
stance-p = Zustimmend
stance-0 = Neutral
stance-m = Ablehnend
stance-mm = Stark ablehnend
menu-graph =
    .label = Referenzgraph
menu-list =
    .label = Referenzliste
prefs-backup-title = Sicherung
prefs-backup-desc = Speichert alle qualifizierten Referenzen aller Bibliotheken mit allen Feldern in eine JSON-Datei. Beim Wiederherstellen wird eine solche Datei zusammengeführt: Fehlende Referenzen kommen zurück, spätere Änderungen bleiben erhalten, gelöscht wird nichts.
prefs-backup-button =
    .label = Sichern…
prefs-restore-button =
    .label = Wiederherstellen…
backup-title = Qualifizierte Referenzen sichern
backup-done = { $count ->
    [one] Sicherung gespeichert: 1 Referenz.
   *[other] Sicherung gespeichert: { $count } Referenzen.
}
backup-failed = Die Sicherung konnte nicht gespeichert werden. Details stehen in der Debug-Ausgabe.
restore-title = Qualifizierte Referenzen aus einer Sicherung wiederherstellen
restore-invalid = Diese Datei ist keine Sicherung von Qualified References.
restore-done = Wiederhergestellt: { $added } hinzugefügt, { $updated } aktualisiert in { $items } Items.
restore-skipped = Übersprungene Items: { $notFound } nicht gefunden, { $readOnly } schreibgeschützt, { $tooLarge } zu groß für die Synchronisierung.
restore-failed = Die Sicherung konnte nicht wiederhergestellt werden. Details stehen in der Debug-Ausgabe.
list-window-title = Qualifizierte Referenzen – Liste
list-no-match = Keine passenden Einträge.
list-search = Titel oder Autor suchen
list-expand-all = Alle aufklappen
list-collapse-all = Alle zuklappen
list-sort = Sortierung
list-sort-alpha = Alphabetisch
list-sort-count = Anzahl Bezüge
list-sort-year = Jahr
list-open-pdf = ↗ PDF
list-open-pdf-title = Stelle im PDF öffnen
list-show-comment = Klicken, um den ganzen Kommentar zu zeigen
graph-window-title = Qualifizierte Referenzen – Graph
graph-empty = Noch keine Bezüge.
graph-type-other = Sonstige
graph-out = Bezüge auf
graph-in = Referenziert von
graph-legend = Legende
graph-controls = Bedienelemente
graph-link-distance = Kantenlänge
graph-tags = Tags hervorheben
graph-tags-filter = Tags filtern …
graph-tags-none = Keine Tags in diesem Bereich.
graph-tag-focus = Nur hervorgehobene Einträge und ihre Nachbarn
graph-layout-network = Netz
graph-layout-timeline = Zeitachse
graph-layout-ego = Ego-Netz
graph-layout-layers = Schichten
graph-layer-level = Ebene
graph-hint-network = Verbundene Einträge ziehen sich an; Gruppen ohne gemeinsame Bezüge liegen getrennt voneinander.
graph-hint-timeline = Einträge nach Erscheinungsjahr von links nach rechts; Einträge ohne Jahr stehen rechts außen.
graph-hint-ego = Ein Eintrag in der Mitte: im linken Halbkreis, wer auf ihn verweist; im rechten, worauf er verweist; oben und unten gegenseitige Bezüge. Blass im äußeren Ring: die nächste Ebene. Klick oder Suche mit Enter setzt einen Eintrag in die Mitte.
graph-hint-layers = Einträge nach Zitierfluss in Ebenen: Ebene 0 zitiert keinen der gezeigten Einträge; jede höhere Ebene verweist auf Einträge darunter. Zirkelbezüge werden an einer Stelle aufgebrochen.
graph-undated = o. J.
graph-search = Einträge suchen …
graph-search-depth2 = Auch Nachbarn der Nachbarn
graph-filters = Filter
graph-filter-stances = Stances
graph-filter-types = Eintragsarten
graph-min-links = Mind. Bezüge je Eintrag
graph-size-incoming = Größe nach eingehenden Bezügen
graph-link-open-pdf = Klick: Stelle im PDF öffnen
graph-link-select = Klick: zitierenden Eintrag auswählen
export = Export
export-title = Referenzen exportieren
export-csv = CSV (eine Zeile pro Referenz)
export-graphml = GraphML (Gephi, Cytoscape)
export-png = Bild (PNG)
export-md = Markdown
scope-label = Bereich
scope-all = Alle Bibliotheken
scope-selection = Aktuelle Auswahl in Zotero
prefs-title = Qualifizierte Referenzen
prefs-palette-label = Stance-Farben
prefs-palette-default =
    .label = Standard
prefs-palette-colorblind =
    .label = Farbenblind-sicher
prefs-stance-compact =
    .label = Kompakter Stance-Setzer (eine Pille mit Menü)
prefs-edit-incoming =
    .label = Eingehende Bezüge unter „Referenziert von“ hinzufügen und bearbeiten
prefs-comment-max = Kommentare höchstens (Zeichen):
prefs-pane-title = Seitenleiste und Listenfenster
prefs-pane-fields = Einträge anzeigen mit:
prefs-graph-title = Graph-Fenster
prefs-graph-fields = Knoten beschriften mit:
prefs-graph-controls = Bedienelemente im Fenster:
prefs-graph-controls-desc = Ausgeblendete Elemente behalten ihren Standard- bzw. zuletzt gespeicherten Wert: Knoten bleiben nach eingehenden Bezügen skaliert, die Kantenlänge bleibt wie gespeichert, und der Graph öffnet als Netz.
prefs-colors-title = Farben
prefs-field-author =
    .label = Autor
prefs-field-year =
    .label = Jahr
prefs-field-title =
    .label = Titel
prefs-graph-colorbytype =
    .label = Knoten nach Item-Typ einfärben
prefs-graph-export-transparent =
    .label = PNG-Export mit transparentem Hintergrund
prefs-graph-show-search =
    .label = Suche
prefs-graph-show-filters =
    .label = Filter
prefs-graph-show-tags =
    .label = Tag-Hervorhebung
prefs-graph-show-size =
    .label = Größen-Schalter
prefs-graph-show-distance =
    .label = Kantenlänge
prefs-graph-show-timeline =
    .label = Zeitachse
prefs-graph-show-ego =
    .label = Ego-Netz
prefs-graph-show-layers =
    .label = Schichten
prefs-graph-views = Zusätzliche Ansichten neben dem Netz:
prefs-reader-title = PDF-Reader
prefs-reader-selection-button =
    .label = Knopf „Qualifizierte Referenz anlegen“ im Textauswahl-Popup anzeigen
prefs-privacy-title = Datenschutz
prefs-copy-refs-to-group =
    .label = Qualifizierte Referenzen beim Hinzufügen eines Eintrags zu einer Gruppenbibliothek mitkopieren
prefs-copy-refs-to-group-desc = Aus (empfohlen): Wie bei Zoteros „Verwandt“-Verknüpfungen werden Referenzen samt privater Kommentare und Stances aus der Kopie entfernt. An: Sie bleiben erhalten und sind für alle in der Gruppe sichtbar.
anchor-open = ↗ Im PDF (A)
anchor-missing = (Markierung gelöscht)
anchor-page = S.
reader-add-ref = Qualifizierte Referenz von hier…
reader-ref-created = Referenz angelegt
save-too-large = Nicht gespeichert: Mit diesen Referenzen würde das Extra-Feld des Items zu groß für die Synchronisierung. Kommentare kürzen oder Referenzen entfernen.
reader-groupcopy-stripped = Qualifizierte Referenzen wurden nicht in die Gruppe kopiert (siehe Einstellungen → Datenschutz)

# Beschriftungen für Bearbeiten > Rückgängig/Wiederholen (Zotero 10)
undo-add-reference = { $count ->
    [one] Bezug hinzufügen
   *[other] { $count } Bezüge hinzufügen
}
undo-edit-reference = Bezug bearbeiten
undo-delete-reference = Bezug löschen
undo-restore-references = Bezüge wiederherstellen

# Änderungsjournal (S4) und Löschungen durch andere Werkzeuge (S5)
journal-title = { $count ->
    [one] Früherer Stand (1)
   *[other] Frühere Stände ({ $count })
}
journal-desc = Nur auf diesem Gerät gespeichert, jeweils vor einer Änderung der Bezüge dieses Eintrags.
journal-entry = { $count ->
    [one] Bis { $time }: 1 Bezug
   *[other] Bis { $time }: { $count } Bezüge
}
journal-restore = Wiederherstellen
journal-dismiss = Ausblenden
journal-banner = { $count ->
    [one] Der Bezug dieses Eintrags wurde außerhalb von Qualified References entfernt (etwa durch ein anderes Werkzeug oder in der Web-Bibliothek).
   *[other] Die { $count } Bezüge dieses Eintrags wurden außerhalb von Qualified References entfernt (etwa durch ein anderes Werkzeug oder in der Web-Bibliothek).
}
journal-removed-one = Die Bezüge von „{ $title }“ wurden außerhalb von Qualified References entfernt. Im Eintragsbereich lassen sie sich wiederherstellen.
journal-removed-many = Die Bezüge von { $count } Einträgen wurden außerhalb von Qualified References entfernt. Im Bereich des jeweiligen Eintrags lassen sie sich wiederherstellen.
