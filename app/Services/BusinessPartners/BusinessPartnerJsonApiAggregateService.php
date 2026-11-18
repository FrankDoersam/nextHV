<?php

namespace App\Services\BusinessPartners;

use App\Models\BusinessPartner;
use App\Models\BusinessPartnerAddress;
use App\Models\BusinessPartnerCommunicationChannel;
use App\Models\BusinessPartnerOrganizationProfile;
use App\Models\BusinessPartnerPersonProfile;
use Illuminate\Support\Facades\DB;

final class BusinessPartnerJsonApiAggregateService
{
    public function prepareSaving(BusinessPartner $partner): void
    {
        $profile = $partner->pendingJsonApiProfile();
        if ($profile === null) {
            return;
        }

        $partner->display_name = $partner->partner_kind === 'person'
            ? trim(collect([
                $profile['title'] ?? null,
                $profile['firstName'] ?? null,
                $profile['lastName'] ?? null,
            ])->filter()->join(' '))
            : trim((string) ($profile['registeredName'] ?? $partner->display_name));
    }

    public function persistPending(BusinessPartner $partner): void
    {
        $profile = $partner->pendingJsonApiProfile();
        $address = $partner->pendingJsonApiPrimaryAddress();
        $contact = $partner->pendingJsonApiPrimaryContact();
        $initialContactPerson = $partner->pendingJsonApiInitialContactPerson();

        if ($profile === null && $address === null && $contact === null && $initialContactPerson === null) {
            return;
        }

        DB::transaction(function () use ($partner, $profile, $address, $contact, $initialContactPerson): void {
            if ($profile !== null) {
                $this->persistProfile($partner, $profile);
            }
            if ($address !== null) {
                $this->persistPrimaryAddress($partner, $address);
            }
            if ($contact !== null) {
                $this->persistPrimaryContact($partner, $contact);
            }
            if ($initialContactPerson !== null) {
                $partner->outgoingRelationships()->create([
                    'to_business_partner_id' => $initialContactPerson['parentBusinessPartnerId'],
                    'type' => 'contact_person',
                    'position' => $initialContactPerson['position'] ?? null,
                    'responsibility' => null,
                    'is_primary_contact' => false,
                    'valid_from' => today()->toDateString(),
                    'valid_until' => null,
                ]);
            }
        }, 3);

        $partner->clearPendingJsonApiAggregate();
        $partner->unsetRelation('personProfile');
        $partner->unsetRelation('organizationProfile');
        $partner->unsetRelation('addresses');
        $partner->unsetRelation('communicationChannels');
    }

    /** @param array<string, mixed> $values */
    private function persistProfile(BusinessPartner $partner, array $values): void
    {
        if ($partner->partner_kind === 'person') {
            /** @var BusinessPartnerPersonProfile $profile */
            $profile = $partner->personProfile()->withTrashed()->firstOrNew();
            if ($profile->exists && $profile->trashed()) {
                $profile->restore();
            }
            $profile->fill([
                'salutation' => $values['salutation'] ?? null,
                'title' => $values['title'] ?? null,
                'first_name' => $values['firstName'] ?? '',
                'last_name' => $values['lastName'] ?? '',
                'birth_date' => $values['birthDate'] ?? null,
            ]);
            $profile->saveOrFail();
            return;
        }

        /** @var BusinessPartnerOrganizationProfile $profile */
        $profile = $partner->organizationProfile()->withTrashed()->firstOrNew();
        if ($profile->exists && $profile->trashed()) {
            $profile->restore();
        }
        $profile->fill([
            'registered_name' => $values['registeredName'] ?? '',
            'legal_form' => $values['legalForm'] ?? null,
            'vat_id' => $values['vatId'] ?? null,
            'tax_number' => $values['taxNumber'] ?? null,
            'registration_number' => $values['registrationNumber'] ?? null,
            'registration_court' => $values['registrationCourt'] ?? null,
        ]);
        $profile->saveOrFail();
    }

    /** @param array<string, mixed> $values */
    private function persistPrimaryAddress(BusinessPartner $partner, array $values): void
    {
        $address = $partner->addresses()
            ->where('is_primary', true)
            ->orderByDesc('valid_from')
            ->first();

        $payload = [
            'type' => $values['type'] ?? 'business',
            'label' => $values['label'] ?? null,
            'street' => $values['street'] ?? '',
            'house_number' => $values['houseNumber'] ?? null,
            'postal_code' => $values['postalCode'] ?? '',
            'city' => $values['city'] ?? '',
            'state' => $values['state'] ?? null,
            'country_code' => strtoupper((string) ($values['countryCode'] ?? 'DE')),
            'is_primary' => true,
        ];

        if ($address) {
            $address->fill($payload)->saveOrFail();
            return;
        }

        $partner->addresses()->create($payload + ['valid_from' => today()->toDateString()]);
    }

    /** @param array<string, mixed> $values */
    private function persistPrimaryContact(BusinessPartner $partner, array $values): void
    {
        $this->persistContactChannel($partner, 'email', $values['email'] ?? null);
        $this->persistContactChannel($partner, 'phone', $values['phone'] ?? null);
    }

    private function persistContactChannel(BusinessPartner $partner, string $type, mixed $rawValue): void
    {
        $value = trim((string) ($rawValue ?? ''));
        /** @var BusinessPartnerCommunicationChannel|null $channel */
        $channel = $partner->communicationChannels()
            ->where('type', $type)
            ->orderByDesc('is_primary')
            ->orderByDesc('valid_from')
            ->first();

        if ($value === '') {
            if ($channel) {
                $channel->delete();
            }
            return;
        }

        if ($channel) {
            $channel->fill(['value' => $value, 'is_primary' => true])->saveOrFail();
            return;
        }

        $partner->communicationChannels()->create([
            'type' => $type,
            'value' => $value,
            'is_primary' => true,
            'valid_from' => today()->toDateString(),
        ]);
    }
}
