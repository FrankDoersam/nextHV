<?php

namespace App\Services\Documents;

use App\Application\Documents\OrganizationLogoService;
use App\Models\OrganizationSetting;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Resolves current landlord/issuer master data for newly generated documents.
 *
 * Callers must persist this resolved value in the issued document snapshot. Reprints
 * must use the saved snapshot/PDF rather than calling current() again.
 */
final class OrganizationDocumentProfile
{
    /** @return array<string, string> */
    public function current(): array
    {
        $setting = OrganizationSetting::query()
            ->where('section', 'organization')
            ->where('key', 'communication')
            ->first();
        $profile = $this->normalize($setting?->values ?? OrganizationSetting::DEFAULTS['communication']);
        // Raster bytes are resolved once at issuance and travel with that
        // snapshot. Neither a reprint nor a renderer looks up today's logo.
        $profile['logoDataUri'] = '';
        if ($profile['logoDocumentId'] !== '') {
            try {
                $logos = app(OrganizationLogoService::class);
                $document = $logos->validateReference($profile['logoDocumentId'], $setting);
                if ($document !== null) {
                    $profile['logoDataUri'] = 'data:'.$document->mime_type.';base64,'.base64_encode($logos->readValidatedImage($document));
                }
            } catch (ValidationException) {
                // A once-valid optional logo can go missing after a restore or
                // storage migration. Never embed unverified bytes or block a
                // new business document because of the missing image.
                Log::warning('Configured issuer logo is unavailable; omitting it from a new document.', [
                    'communication_setting_id' => (string) $setting?->id,
                    'logo_document_id' => $profile['logoDocumentId'],
                ]);
                $profile['logoDocumentId'] = '';
            }
        }

        return $profile;
    }

    /**
     * Pure presentation of current values or an already captured issuer snapshot.
     * Document callers select the tax/payment purpose; neither is inferred from
     * the landlord type, an available identifier or global bank-account fields.
     * Strings remain literal text. PDF renderers own escaping, wrapping and space.
     *
     * @param array<string, mixed> $values
     * @param array{reference?:string,invoiceTaxIdentityRequired?:bool,showVatId?:bool,showEconomicId?:bool,payment?:array<string,mixed>} $document
     * @return array{identity:array{title:string,lines:list<string>},contact:array{title:string,lines:list<string>},payment:array{title:string,lines:list<string>},legal:list<array{label:string,value:string}>,notes:list<string>,reference:string}
     */
    public function footerContent(array $values, array $document = []): array
    {
        $profile = $this->normalize($values);
        $identity = $this->nonEmptyLines([
            trim($profile['street'].' '.$profile['houseNumber']),
            trim($profile['postalCode'].' '.$profile['city']),
        ]);
        if ($identity === []) {
            $identity = $this->nonEmptyLines([$this->text($values['address'] ?? '')]);
        }
        if ($profile['profileType'] === 'sole_proprietor' && $profile['tradingName'] !== '' && $profile['tradingName'] !== $profile['senderName']) {
            $identity[] = 'Geschäftsbezeichnung: '.$profile['tradingName'];
        }

        $contact = [];
        foreach (['phone' => 'Tel.', 'email' => 'E-Mail'] as $field => $label) {
            if ($profile[$field] !== '') $contact[] = $label.': '.$profile[$field];
        }
        if ($contact === []) {
            $contact = $this->nonEmptyLines([$this->text($values['contact'] ?? '')]);
        }

        $legal = [];
        if ($profile['registeredOffice'] !== '') {
            $legal[] = [
                'label' => $profile['profileType'] === 'sole_proprietor' ? 'Niederlassung' : 'Sitz',
                'value' => $profile['registeredOffice'],
            ];
        }
        $registration = implode(' · ', $this->nonEmptyLines([$profile['registrationCourt'], $profile['registrationNumber']]));
        if ($registration !== '') {
            $legal[] = ['label' => $this->registrationTypeLabel($profile['registrationType']) ?: 'Register', 'value' => $registration];
        }
        $person = $this->personalName($profile);
        if ($this->isRegisteredSoleProprietor($profile) && $person !== '' && $person !== $profile['senderName']) {
            $legal[] = ['label' => 'Inhaber', 'value' => $person];
        }
        if ($profile['representedBy'] !== '') $legal[] = ['label' => $this->representationLabel($profile), 'value' => $profile['representedBy']];
        if ($profile['supervisoryChair'] !== '') $legal[] = ['label' => 'Aufsichtsratsvorsitz', 'value' => $profile['supervisoryChair']];
        if ($profile['generalPartnerDetails'] !== '') $legal[] = ['label' => 'Persönlich haftende Gesellschafter', 'value' => $profile['generalPartnerDetails']];

        $requiresTaxIdentity = ($document['invoiceTaxIdentityRequired'] ?? false) === true;
        // An optional display switch cannot suppress explicitly required invoice
        // data. A W-ID is never used as a substitute for either permitted field.
        if ($profile['vatId'] !== '' && (($document['showVatId'] ?? false) !== false || $requiresTaxIdentity)) {
            $legal[] = ['label' => 'USt-IdNr.', 'value' => $profile['vatId']];
        } elseif ($requiresTaxIdentity && $profile['taxNumber'] !== '') {
            $legal[] = ['label' => 'Steuernummer', 'value' => $profile['taxNumber']];
        } elseif ($requiresTaxIdentity) {
            throw ValidationException::withMessages([
                'document.invoiceTaxIdentity' => 'Für diese Rechnung fehlt die Steuerkennung des Vermieters. Bitte hinterlegen Sie eine Steuernummer oder USt-IdNr.',
            ]);
        }
        if (($document['showEconomicId'] ?? false) === true && $profile['economicId'] !== '') {
            $legal[] = ['label' => 'W-IdNr.', 'value' => $profile['economicId']];
        }

        $payment = is_array($document['payment'] ?? null) ? $document['payment'] : [];
        $paymentLines = [];
        $holder = $this->text($payment['accountHolder'] ?? '');
        $iban = $this->text($payment['iban'] ?? '');
        if (($payment['purpose'] ?? '') === 'payment' && $holder !== '' && $iban !== '') {
            $paymentLines = $this->nonEmptyLines([
                'Zahlungsempfänger: '.$holder,
                'IBAN: '.$iban,
                $this->text($payment['bic'] ?? '') !== '' ? 'BIC: '.$this->text($payment['bic']) : '',
                $this->text($payment['bankName'] ?? '') !== '' ? 'Institut: '.$this->text($payment['bankName']) : '',
            ]);
        }

        return [
            'identity' => ['title' => $profile['senderName'], 'lines' => $identity],
            'contact' => ['title' => 'Kontakt', 'lines' => $contact],
            'payment' => ['title' => 'Bankverbindung', 'lines' => $paymentLines],
            'legal' => $legal,
            'notes' => $this->nonEmptyLines([$profile['footerText']]),
            'reference' => $this->text($document['reference'] ?? ''),
        ];
    }

    /** @param array<string, mixed> $values @return array<string, string> */
    public function normalize(array $values): array
    {
        $result = [];
        foreach (OrganizationSetting::DEFAULTS['communication'] as $key => $default) {
            $result[$key] = trim((string) ($values[$key] ?? $default));
        }
        // These are server-generated snapshot/legacy projection fields, never
        // writable file paths or URLs in the communication settings request.
        foreach (['logoDataUri', 'footerText', 'creditorId'] as $key) {
            $result[$key] = trim((string) ($values[$key] ?? ''));
        }
        // Older document contexts used name (or an untyped title) for the issuer.
        // Typed personal titles remain honorifics and never become company names.
        if ($result['senderName'] === '') $result['senderName'] = $this->text($values['name'] ?? '');
        if ($result['senderName'] === '' && $result['profileType'] === '' && $result['firstName'] === '' && $result['lastName'] === '') {
            $result['senderName'] = $result['title'];
        }

        // A settings profile represents one legal issuer at a time. Remove incompatible
        // identity fields from the normalized document context so a type switch cannot
        // leak stale company/person details into template placeholders.
        if ($result['profileType'] === 'company') {
            $result['salutation'] = '';
            $result['title'] = '';
            $result['firstName'] = '';
            $result['lastName'] = '';
            $result['tradingName'] = '';
        } elseif (in_array($result['profileType'], ['individual', 'sole_proprietor'], true)) {
            $result['representedBy'] = '';
            $result['supervisoryChair'] = '';
            $result['generalPartnerDetails'] = '';
        }

        if ($result['profileType'] === 'individual') {
            foreach (['registeredName', 'tradingName', 'legalForm', 'registeredOffice', 'registrationType', 'registrationNumber', 'registrationCourt'] as $key) {
                $result[$key] = '';
            }
        }

        $personalName = $this->personalName($result);

        $registeredSoleProprietor = $this->isRegisteredSoleProprietor($result);
        if (($result['profileType'] === 'company' || $registeredSoleProprietor) && $result['registeredName'] !== '') {
            $registeredName = $result['registeredName'];
            $legalForm = $result['legalForm'];
            $hasSeparateLegalForm = $legalForm !== ''
                && preg_match('/(?:^|[[:space:],])'.preg_quote($legalForm, '/').'($|[[:space:],.])/iu', $registeredName) === 1;
            $result['senderName'] = $legalForm !== '' && ! $hasSeparateLegalForm
                ? $registeredName.' '.$legalForm
                : $registeredName;
        } elseif (in_array($result['profileType'], ['individual', 'sole_proprietor'], true) && $personalName !== '') {
            $result['senderName'] = $personalName;
        }

        $result['profileTypeLabel'] = match ($result['profileType']) {
            'individual' => 'Privatperson',
            'sole_proprietor' => 'Einzelunternehmen',
            'company' => 'Gesellschaft / Organisation',
            default => '',
        };

        $result['address'] = trim(collect([
            trim($result['street'].' '.$result['houseNumber']),
            trim($result['postalCode'].' '.$result['city']),
        ])->filter(fn (string $part): bool => $part !== '')->implode(', '));

        $registrationType = $this->registrationTypeLabel($result['registrationType']);
        $result['registrationDescription'] = trim(collect([
            $registrationType,
            $result['registrationNumber'],
            $result['registrationCourt'] !== '' ? 'Registergericht '.$result['registrationCourt'] : '',
        ])->filter(fn (string $part): bool => $part !== '')->implode(' '));

        $legalLines = [$result['senderName']];
        if ($registeredSoleProprietor && $personalName !== '' && $personalName !== $result['senderName']) {
            $legalLines[] = 'Inhaber: '.$personalName;
        }
        if ($result['profileType'] === 'sole_proprietor' && $result['tradingName'] !== '') {
            $legalLines[] = 'Geschäftsbezeichnung '.$result['tradingName'];
        }
        if (in_array($result['profileType'], ['company', 'sole_proprietor'], true)) {
            if ($result['registeredOffice'] !== '') $legalLines[] = 'Sitz: '.$result['registeredOffice'];
            if ($result['registrationDescription'] !== '') $legalLines[] = $result['registrationDescription'];
        }
        if ($result['representedBy'] !== '') $legalLines[] = 'Vertreten durch: '.$result['representedBy'];
        if ($result['supervisoryChair'] !== '') $legalLines[] = 'Vorsitz des Aufsichtsrats: '.$result['supervisoryChair'];
        if ($result['generalPartnerDetails'] !== '') $legalLines[] = 'Persönlich haftende Gesellschafter: '.$result['generalPartnerDetails'];
        // A private landlord can also have VAT/economic identifiers. The tax
        // number is intentionally not published on an ordinary business letter;
        // the economic ID does not stand in for invoice-specific tax particulars.
        if ($result['vatId'] !== '') $legalLines[] = 'USt-IdNr. '.$result['vatId'];
        if ($result['economicId'] !== '') $legalLines[] = 'W-IdNr. '.$result['economicId'];

        $result['legalFooter'] = implode(' · ', array_values(array_unique(array_filter($legalLines, static fn (string $line): bool => $line !== ''))));

        return $result;
    }

    /** @param array<string, string> $profile */
    private function personalName(array $profile): string
    {
        return implode(' ', $this->nonEmptyLines([$profile['title'], $profile['firstName'], $profile['lastName']]));
    }

    /** @param array<string, string> $profile */
    private function isRegisteredSoleProprietor(array $profile): bool
    {
        return $profile['profileType'] === 'sole_proprietor'
            && $profile['registrationType'] === 'handelsregister'
            && $profile['registrationNumber'] !== ''
            && $profile['registeredName'] !== '';
    }

    private function registrationTypeLabel(string $type): string
    {
        return match ($type) {
            'handelsregister' => 'Handelsregister',
            'genossenschaftsregister' => 'Genossenschaftsregister',
            'partnerschaftsregister' => 'Partnerschaftsregister',
            'gesellschaftsregister' => 'Gesellschaftsregister',
            'vereinsregister' => 'Vereinsregister',
            'other' => 'Register',
            default => $type,
        };
    }

    /** @param array<string, string> $profile */
    private function representationLabel(array $profile): string
    {
        // Only an explicit legal form selects an organ's name. In particular,
        // GmbH & Co. KG is not a GmbH and an unknown form remains generic.
        $form = mb_strtolower(preg_replace('/[^\p{L}0-9]+/u', '', $profile['legalForm']) ?? '', 'UTF-8');
        $phase = '/(?:^|[\s,(])(?:i\.\s*l\.|in\s+liquidation|in\s+abwicklung)(?:$|[\s,)])/iu';
        if (preg_match($phase, $profile['legalForm'].' '.$profile['senderName']) === 1) {
            $baseForm = preg_replace($phase, ' ', $profile['legalForm']) ?? $profile['legalForm'];
            $baseForm = mb_strtolower(preg_replace('/[^\p{L}0-9]+/u', '', $baseForm) ?? '', 'UTF-8');

            return in_array($baseForm, ['ag', 'gag', 'aktiengesellschaft'], true) ? 'Abwickler' : 'Liquidatoren';
        }

        return match ($form) {
            'gmbh', 'ggmbh', 'gesellschaftmitbeschränkterhaftung', 'ug', 'ughaftungsbeschränkt', 'unternehmergesellschafthaftungsbeschränkt' => 'Geschäftsführung',
            'ag', 'gag', 'aktiengesellschaft', 'eg', 'eingetragenegenossenschaft' => 'Vorstand',
            default => 'Vertreten durch',
        };
    }

    /** @param list<string> $lines @return list<string> */
    private function nonEmptyLines(array $lines): array
    {
        return array_values(array_filter($lines, static fn (string $line): bool => $line !== ''));
    }

    private function text(mixed $value): string
    {
        return is_string($value) || is_numeric($value) ? trim((string) $value) : '';
    }
}
