<?php

namespace Database\Seeders;

use App\Models\OrganizationSetting;
use Illuminate\Database\Seeder;

class OperatingCostStatementTemplateSeeder extends Seeder
{
    public const HEADER = 'anbei erhalten Sie Ihre Betriebskostenabrechnung für den angegebenen Zeitraum. Die einzelnen Kosten und ihre Verteilung sind auf den folgenden Seiten aufgeschlüsselt. Die angerechneten Vorauszahlungen sowie die dazugehörigen Zahlungsbuchungen, soweit vorhanden, finden Sie auf der letzten Seite.';

    public const PAYMENT_FOOTER = <<<'TEXT'
Aus der Abrechnung ergibt sich eine Nachzahlung in Höhe von {{ statement.amount }}. Bitte überweisen Sie den Betrag bis spätestens zum {{ statement.dueDate }} auf das für das Objekt hinterlegte Nachzahlungskonto der Verwaltung. Geben Sie dabei den Verwendungszweck {{ statement.reference }} an. Maßgeblich ist der rechtzeitige Zahlungseingang. Einwendungen gegen die Abrechnung bleiben unberührt.

Bankverbindung:
Kontoinhaber: {{ settlement.accountHolder }}
IBAN: {{ settlement.iban }}
Betrag: {{ statement.amount }}
Verwendungszweck: {{ statement.reference }}
TEXT;

    public const CREDIT_FOOTER = <<<'TEXT'
Aus der Abrechnung ergibt sich zu Ihren Gunsten ein Guthaben in Höhe von {{ statement.amount }}. Dieses Guthaben zahlen wir bis spätestens zum {{ statement.dueDate }} auf das für den Vertrag hinterlegte Auszahlungskonto aus. Einwendungen gegen die Abrechnung bleiben unberührt.

Auszahlungskonto:
Kontoinhaber: {{ settlement.accountHolder }}
IBAN: {{ settlement.iban }}
TEXT;

    public function run(): void
    {
        $setting = OrganizationSetting::query()->firstOrNew([
            'section' => 'organization',
            'key' => 'property-billing',
        ]);

        $defaults = OrganizationSetting::DEFAULTS['property-billing'];
        $current = is_array($setting->payload) ? $setting->payload : [];
        $values = array_replace($defaults, array_intersect_key($current, $defaults));

        $values['statementHeaderTemplate'] = $this->filledOrDefault($values['statementHeaderTemplate'] ?? null, self::HEADER);
        $values['statementPaymentFooterTemplate'] = $this->filledOrDefault($values['statementPaymentFooterTemplate'] ?? null, self::PAYMENT_FOOTER);
        $values['statementCreditFooterTemplate'] = $this->filledOrDefault($values['statementCreditFooterTemplate'] ?? null, self::CREDIT_FOOTER);
        $values['statementPaymentDueDays'] = $this->days($values['statementPaymentDueDays'] ?? null, 30);
        $values['statementCreditDueDays'] = $this->days($values['statementCreditDueDays'] ?? null, 30);

        $setting->section = 'organization';
        $setting->key = 'property-billing';
        $setting->payload = $values;
        $setting->saveQuietly();
    }

    private function filledOrDefault(mixed $value, string $default): string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : $default;
    }

    private function days(mixed $value, int $default): int
    {
        return is_numeric($value) ? max(0, min(365, (int) $value)) : $default;
    }
}
