# Deklarativer CRUD-Kern

nextHV verwendet Laravel REST API 3 (Lomkit) weiterhin für Search, Mutations,
Actions und Berechtigungen. Der gemeinsame CRUD-Regelkern ergänzt die API und
Eloquent-Modelle; er ersetzt Lomkit **nicht**.

## Modelldefinition

Modelle mit CRUD-Regeln verwenden **HasCrudRules** und überschreiben
**crudRules()**. Der Trait registriert Laravel-Modellevents automatisch.
Für Standardregeln ist kein individueller Observer erforderlich.

    use App\Framework\Crud\CrudRules;
    use App\Framework\Crud\HasCrudRules;

    class Building extends Model
    {
        use HasCrudRules;

        public static function crudRules(): CrudRules
        {
            return CrudRules::make()
                ->default('country', 'DE')
                ->force('source', 'internal')
                ->createOnly('external_id')
                ->restrictDelete(
                    'units',
                    'Gebäude mit Einheiten dürfen nicht gelöscht werden.'
                );
        }
    }

**default** setzt den Wert nur beim Erstellen, wenn das Attribut fehlt.
Explizite Werte einschließlich null bleiben bestehen. **force** setzt einen
festen Wert bei jedem Eloquent-Speichern und überschreibt mitgesendete Werte.
**createOnly** verhindert nachträgliche Änderungen. **restrictDelete**
blockiert das Löschen bei vorhandenen Relationen; per drittem Argument können
auch Soft-Deletes berücksichtigt werden. **preventDeleteWhen** und
**protectWhen** erlauben fachliche Prädikate, deren Ausführung im Framework
bleibt.

Ein neues Modell muss den Trait aktiv verwenden. Direkte Query-Builder-
Massenoperationen und Raw SQL lösen keine Eloquent-Modellevents aus;
für geschützte Daten sind zusätzlich Datenbank-Constraints sinnvoll.

## Automatische Registrierung

Die API erkennt Controller unter **app/Rest/Controllers/*Controller.php**.
Der Ressourcenname wird vom Eloquent-Modell abgeleitet, beispielsweise
BusinessPartner zu business-partners. Controller verweisen wie bisher über
die statische Property auf die Lomkit-REST-Resource. Zusätzliche Routen-
Registrierung ist nicht erforderlich.

Die React-Registry erkennt jedes Modul unter
**resources/js/modules/**/*-resource.ts** und verwendet dessen exportierte
ResourceDefinition. Neue Ressourcen brauchen keinen manuellen Registry-Eintrag.

Die API liefert autorisierte Metadaten unter
**GET /api/v1/_meta/resources/{resource}** (Defaults, erzwungene und
Create-only-Felder, Relations-Löschsperren). React verwendet die Metadaten
für Formulardefaults und Feldsperren. Das Backend ist immer verbindlich.

## Grenzen

Model, Migration, Lomkit-Resource, dünner Controller und eine Frontend-
ResourceDefinition werden für neue Fachressourcen weiterhin benötigt.
Die Registrierungen sind automatisch, die Datenbanktabelle und die
UI-Felder werden aber nicht aus dem Model generiert. Fachlich komplexe
Workflows dürfen weiterhin Domain-Actions/Observer verwenden.
