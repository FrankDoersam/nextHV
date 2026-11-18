<?php

namespace App\Services\Documents;

/**
 * One durable definition for document-level signature overrides.
 * Organization data is only the default; every generated document may override
 * the representative/signing person without mutating the global organization.
 */
final class DocumentSignatureInputDefinitions
{
    /** @return array<int, array<string, mixed>> */
    public static function landlord(): array
    {
        return [
            [
                'key' => 'signature.location',
                'label' => 'Ort',
                'type' => 'text',
                'group' => 'Unterschrift',
                'required' => false,
                'placeholder' => 'z. B. Frankfurt am Main',
                'helpText' => 'Kann für dieses Dokument abweichend gepflegt werden.',
                'defaultSource' => 'organization.city',
            ],
            [
                'key' => 'signature.date',
                'label' => 'Datum',
                'type' => 'date',
                'group' => 'Unterschrift',
                'required' => false,
                'helpText' => 'Wird nur für dieses Dokument verwendet.',
                'defaultValue' => '',
            ],
            [
                'key' => 'signature.representedBy',
                'label' => 'Vertreten durch',
                'type' => 'text',
                'group' => 'Vertragsparteien',
                'required' => false,
                'placeholder' => 'Name der vertretenden / beauftragten Person',
                'helpText' => 'Dokumentbezogene Vertretung. Die Organisation liefert nur die Vorbelegung; Änderungen wirken nicht auf die Stammdaten zurück.',
                'defaultSource' => 'organization.representedBy',
            ],
            [
                'key' => 'signature.landlord',
                'label' => 'Vermieter / Unterzeichner',
                'type' => 'textarea',
                'group' => 'Vertragsparteien',
                'required' => false,
                'helpText' => 'Text für die Vermieter-Unterschriftszeile; kann je Dokument abweichend angepasst werden.',
                'defaultSource' => 'organization.signatureName',
            ],
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public static function contract(): array
    {
        return [
            ...self::landlord(),
            [
                'key' => 'signature.tenants',
                'label' => 'Mieter / Vertragsparteien',
                'type' => 'textarea',
                'group' => 'Vertragsparteien',
                'required' => false,
                'helpText' => 'Mehrere Personen werden mit Semikolon getrennt vorbelegt.',
                'defaultSource' => 'tenants.signatureNames',
            ],
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public static function housingProvider(): array
    {
        return [
            [
                'key' => 'signature.date',
                'label' => 'Datum',
                'type' => 'date',
                'group' => 'Unterschrift',
                'required' => false,
                'helpText' => 'Optional. Bleibt das Feld leer, wird automatisch das heutige Datum verwendet.',
                'defaultSource' => 'today.isoDate',
                'useDefaultWhenEmpty' => true,
            ],
            [
                'key' => 'housing.ownerName',
                'label' => 'Abweichender Eigentümer',
                'type' => 'text',
                'group' => 'Optionale Angaben',
                'required' => false,
                'placeholder' => 'Nur ausfüllen, wenn der Wohnungsgeber nicht Eigentümer ist',
                'helpText' => 'Nach § 19 Abs. 3 BMG ist der Eigentümername nur erforderlich, wenn Wohnungsgeber und Eigentümer nicht identisch sind. Leer lassen, wenn der Wohnungsgeber selbst Eigentümer ist.',
            ],
        ];
    }
}
