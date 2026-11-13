# Erweiterte CRUD-Regeln, Actions und Klonen

## Kombinierbare Löschregeln

Die Regeln werden **im Model** deklariert und im **zentralen Executor**
auf Eloquent-Modellevents geprüft. Das Frontend kann keinen Schutz umgehen.
Beide Formen verwenden denselben `DeleteFilter`:

```php
// Vertrag: Status des Datensatzes
->restrictDeleteOnRecord(
    DeleteFilter::make()->where('status', '!=', 'draft'),
    'Aktive und historische Verträge dürfen nicht gelöscht werden.',
    'contract',
)

// Geschäftspartner: nur Beteiligungen an *aktiven* Verträgen
->restrictDelete(
    'contractParties',
    'Geschäftspartner mit aktivem Vertrag dürfen nicht gelöscht werden.',
    false,
    'partner',
    DeleteFilter::make()->whereHas(
        'contract',
        DeleteFilter::make()->where('status', 'active'),
    ),
)
```

`DeleteFilter` unterstützt `where`, `orWhere`, `whereIn`,
`whereHas`, `orWhereHas`, `group` und `orGroup`. Beliebige
Kombinationen aus UND und ODER sind möglich; **ODER-Ausdrücke bleiben
grundsätzlich innerhalb der Parent-Relation geklammert**. Das verhindert,
dass fremde Geschäftspartnerbeziehungen versehentlich eine Löschung blockieren.

Der Filter ist ausführbarer Servercode; er darf nicht unverifiziert aus
Browserdaten gebaut werden. Für die Unterscheidung aktiv vs. beendet zählt
der explizite Vertragsstatus, nicht automatisch das Vertragsende. Für
rechtlich oder fachlich anders definierte Aktivität muss die Bedingung
entsprechend erweitert werden.

## Actions und strukturierte Rückgabe

Eine Action erhält `ActionFields $fields` und eine `Collection $models`.
Im Beispiel `app/Rest/Actions/PartnerSummary.php` ist `$models->first()`
der ausgewählte Geschäftspartner. Die Action ermittelt `full_name`, zählt
aktive Verträge und gibt zurück:

```php
return ActionResponse::data([
    'message' => 'Geschäftspartnerübersicht erstellt.',
    'record' => ['id' => 1, 'full_name' => 'Max Muster'],
    'navigate' => ['resource' => 'business-partners', 'id' => 1],
]);
```

Die gemeinsame React-Action-Workbench liest den API-Rückgabewert
`data.result.data`. `message` wird als Toast und im Ergebnis angezeigt,
`record` als lesbares Objekt und `navigate` als expliziter Button
„Datensatz öffnen“. Navigationsziele werden gegen die registrierten
Ressourcen validiert; serverseitige Policies gelten weiterhin.

Die Workbench verarbeitet außerdem die nativen Lomkit-Antworten `ActionResponse::message(...)` und `ActionResponse::danger(...)`. Für strukturierte Objekte nutzt man `ActionResponse::data(...)`. Action-Ergebnisse sind **Daten**, keine frei ausführbaren Browserbefehle.

## Generisches Klonen mit Relation-Allowlist

```php
return CrudRules::make()
    ->cloneOverride('status', 'active')
    ->cloneOverride('next_inspection_on', null)
    ->cloneRelation('units', ['status' => 'ready'], true);
```

Mit `cloneRelation` werden **nur ausdrücklich erlaubte HasMany-
Relationen** angeboten. Das optionale dritte Argument gibt an, ob der
Checkboxwert im Dialog standardmäßig aktiviert ist. Die gemeinsame
`CloneService` übernimmt das Erstellen und Kopieren transaktional; sie
prüft die Berechtigungen auf Quelle und Relation. Unbekannte Relationen
werden mit Validierungsfehler abgelehnt.

Konkrete Anwendungen:

- Objekt: Einheiten können kopiert werden, **Verträge nie**.
- Einheit: Stammdaten, keine Vertragsbeziehungen.
- Geschäftspartner: Rollen können kopiert werden; **keine Ausweise und
  keine Vertragsbeteiligungen**.

Neue Ressourcen verwenden `CloneConfiguredResource` mit einer dünnen
Action-Klasse zur Festlegung von Modell, Namensfeld und URL-Ressource;
die eigentliche Klonlogik wird nicht dupliziert.

## Nicht persistierte Attribute

`BusinessPartner::fullName()` ist ein Eloquent-`Attribute`-Accessor.
Er setzt den Vollnamen aus Vor- und Nachname zusammen; andernfalls wird
Firmenname oder Anzeigename verwendet. `full_name` wird per
`$appends` und einem schreibgeschützten REST-Feld angezeigt, aber
**nicht in der Datenbank gespeichert**. Der React-Editor markiert es
als `readOnly`, und der Datenprovider sendet es nicht bei Mutationen.

## Inspirierende Quellen

Filament Actions (Modal, Bestätigung, Benachrichtigung):
https://filamentphp.com/docs/5.x/actions/overview

Refine Custom Mutation / Notifications:
https://refine.dev/core/docs/data/hooks/use-custom-mutation/

Refine Access Control Provider:
https://refine.dev/core/docs/authorization/access-control-provider/

Refine Audit Log Provider:
https://refine.dev/core/docs/guides-concepts/audit-logs/

Das Projekt übernimmt die Konzepte, nicht die Pakete als neue Laufzeit.

Eine optionale vierte `cloneRelation`-Eigenschaft ist ein serverseitiger
Eloquent-Filter (Closure), der nur bestimmte Relationseinträge kopiert,
beispielsweise:
```php
->cloneRelation(
    'roles',
    [],
    false,
    fn (Builder $query) => $query->where('role', 'owner')
)
```
Der Filter wird innerhalb der Parent-Relation geklammert. 
