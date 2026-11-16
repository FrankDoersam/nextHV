# nextHV Sidebar · REUI Base-Mira

Die Sidebar verwendet den vorhandenen REUI-/shadcn-Stack (Base UI, Lucide,
Tailwind-Design-Tokens) und ein einziges serverberechtigtes Navigationsmodell
für Desktop, Mobile-Sheet, eingeklappte Icon-Leiste und die globale Suche.

## Darstellung

- **Aktiver Eintrag:** dezente `bg-primary/[0.09]`-Vollflächenhervorhebung,
  dunkler Text und primärfarbiges Icon. Kein linker Rand mit runden Enden,
  keine Halbkreise, Connector-Linien, Punkte oder zusätzlichen Aktiv-Markierungen.
- **Gruppen:** ein gemeinsamer Icon/Text/Chevron-Trigger, gut lesbar in
  Satzschreibung statt mehreren überlauten Kapitälchen; eingelagerte
  Ressourcenlinks sind dezent eingerückt. Das Disclosure bleibt per Tastatur
  und Screenreader bedienbar.
- **Eingeklappte Navigation:** ein Icon pro Gruppe, ohne Eckpfeile oder
  Badge-Dots. Gruppen-Icons erweitern das Rail und öffnen die jeweilige Gruppe.
  Das Expand-Control sitzt direkt in der 56px-Headerzeile.
- **Footer:** Ausschließlich eine kompakte REUI-/Base-Mira-Kontozeile mit primärfarbenem Initialen-Avatar, Namen, E-Mail-Adresse und dezentem Abmelden-Button. Auch im eingeklappten Rail und auf Mobilgeräten bleiben Avatar und Abmelden erreichbar. Die Einstiegspunkte „Komponenten“ und „Sprache“ sind aus der Sidebar entfernt; die übrigen App-Funktionen werden nicht verändert.
- **Performance:** Sidebar-Ressourcenanzahlen bleiben reine Count-Requests;
  das Navigieren zu einem Eintrag lädt dessen Seite, nicht alle Zielseiten.

Die Gestaltung orientiert sich am öffentlichen REUI-Sidebar-1/3-Konzept
(Gruppen, Collapse, semantische Links) und übernimmt von s4v2 nur die
ruhige Hierarchie und das kompakte Rail. Die s4v2-spezifische
Aktiv-Kennzeichnung als vertikaler Balken wurde **nicht** kopiert.

Quellen:
- https://reui.io/components/sidebar/c-sidebar-1
- https://reui.io/components/sidebar/c-sidebar-3
- https://reui.io/docs/registry
