<?php

namespace App\Services\Documents;

/** Written housing-provider confirmation under § 19 BMG. */
final class HousingProviderConfirmationDocumentBuilder
{
    use BuildsStructuredDocuments;

    /** @return array<int, array<string, mixed>> */
    public function build(): array
    {
        $tenantTable = $this->relationTable('tenantItems', '', [
            ['key' => 'name', 'label' => 'Vor- und Familienname'],
        ], 1, 'Keine einziehende Person hinterlegt.');

        $signature = $this->signatureBlock(
            'Unterschrift Wohnungsgeber / beauftragte Person',
            '',
            true,
            false,
            'organization.signatureName',
            '',
        );
        $signature['attrs']['locationPath'] = 'organization.city';
        $signature['attrs']['datePath'] = 'today.date';
        $signature['attrs']['compact'] = false;
        $signature['attrs']['layout'] = 'closing';

        return [
            $this->heading(1, 'Wohnungsgeberbestätigung'),
            $this->paragraph('Bestätigung des Einzugs nach § 19 Abs. 3 Bundesmeldegesetz (BMG)'),
            $this->paragraph('Vertragsreferenz {{ contract.number }}'),

            $this->heading(2, 'Wohnungsgeber und Eigentümer'),
            $this->factsTable([
                ['Wohnungsgeber', '{{ organization.name }}'],
                ['Anschrift', '{{ organization.address }}'],
                ['Eigentümer, falls abweichend', '{{ inputs.housing.ownerName }}'],
            ]),

            $this->heading(2, 'Wohnung und Einzug'),
            $this->factsTable([
                ['Anschrift der Wohnung', '{{ property.fullAddress }}'],
                ['Einheit', '{{ unit.label }}'],
                ['Einzugsdatum', '{{ contract.startsOn }}'],
            ]),

            $this->heading(2, 'Einziehende Personen'),
            $tenantTable,

            // Deliberate breathing room before the legally relevant declaration.
            ['type' => 'paragraph', 'content' => []],
            $this->heading(2, 'Bestätigung'),
            $this->paragraph('Hiermit wird bestätigt, dass die vorstehend genannten Personen zum angegebenen Datum in die bezeichnete Wohnung eingezogen sind.'),
            $signature,
        ];
    }
}
