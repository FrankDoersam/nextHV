<?php

namespace App\Services\Documents;

use App\Models\Contract;
use App\Models\ContractCondition;
use App\Models\ContractParty;
use App\Services\Documents\OrganizationDocumentProfile;
use Carbon\CarbonImmutable;

final class ContractDocumentContextResolver
{
    public function resolve(Contract $contract): array
    {
        $contract->loadMissing([
            'mainUnit.property.settlementBankAccount',
            'refundBankAccount',
            'parties.businessPartner.personProfile',
            'parties.businessPartner.organizationProfile',
            'parties.businessPartner.addresses',
            'parties.businessPartner.communicationChannels',
            'conditions',
            'deposit.installments',
            'terminations',
            'keyTransfers.unitKey',
            'wasteServices',
        ]);

        $unit = $contract->effectiveMainUnit();
        $unit?->loadMissing([
            'property.settlementBankAccount',
            'meters.latestReading',
            'keys',
            'facilities',
        ]);

        $property = $unit?->property;
        $condition = $contract->conditionForDisplay();
        $referenceDate = $this->partyReferenceDate($contract);

        $partyItems = $contract->parties
            ->sortBy(fn (ContractParty $party): string => implode('|', [
                $party->party_role === 'tenant' ? '0' : ($party->party_role === 'guarantor' ? '1' : '2'),
                $party->valid_from?->format('Y-m-d') ?? '',
                (string) $party->id,
            ]))
            ->values()
            ->map(fn (ContractParty $party): array => $this->party($party))
            ->all();

        $activeParties = $contract->parties
            ->filter(fn (ContractParty $party): bool => $this->activeAt($party, $referenceDate))
            ->values();

        $tenantItems = $activeParties->where('party_role', 'tenant')->map(fn (ContractParty $party): array => $this->party($party))->values()->all();
        $guarantorItems = $activeParties->where('party_role', 'guarantor')->map(fn (ContractParty $party): array => $this->party($party))->values()->all();
        $primaryTenant = $tenantItems[0] ?? $this->emptyParty();

        $communication = app(OrganizationDocumentProfile::class)->current();

        $organizationStreet = trim(collect([$communication['street'] ?? null, $communication['houseNumber'] ?? null])->filter()->join(' '));
        $organizationAddress = collect([
            $organizationStreet,
            trim(collect([$communication['postalCode'] ?? null, $communication['city'] ?? null])->filter()->join(' ')),
        ])->filter()->join(', ');
        $organizationName = trim((string) ($communication['senderName'] ?? ''));
        $organizationRepresentedBy = trim((string) ($communication['representedBy'] ?? ''));
        $organizationSignatureName = $organizationName.($organizationRepresentedBy !== '' ? ', vertreten durch '.$organizationRepresentedBy : '');
        $organizationContact = collect([$communication['phone'] ?? null, $communication['fax'] ?? null, $communication['email'] ?? null])->filter()->join(' / ');

        $startsOn = $contract->starts_on ? CarbonImmutable::instance($contract->starts_on) : null;
        $minimumMonths = max(0, (int) ($contract->minimum_term_months ?? 0));
        $minimumUntil = $startsOn && $minimumMonths > 0 ? $startsOn->addMonths($minimumMonths)->subDay() : null;
        $confirmedEnd = $contract->confirmed_end_on;
        $terminationModel = $contract->terminations
            ->sortByDesc(fn ($row): int => $row->confirmed_end_on?->timestamp ?? $row->created_at?->timestamp ?? 0)
            ->first();

        $cold = $condition?->monthlyColdAmount() ?? 0.0;
        $advance = (float) ($condition?->operating_cost_advance_amount ?? 0) + (float) ($condition?->heating_cost_advance_amount ?? 0);
        $total = $condition?->monthlyWarmAmount() ?? 0.0;

        $keyMovementByKey = $contract->keyTransfers
            ->groupBy(fn ($transfer): string => (string) $transfer->unit_key_id)
            ->map(function ($rows): array {
                $issued = (int) $rows->where('direction', 'issued')->sum('quantity');
                $returned = (int) $rows->where('direction', 'returned')->sum('quantity');
                return ['issued' => $issued, 'returned' => $returned, 'open' => max(0, $issued - $returned)];
            });

        $partyById = collect($partyItems)->keyBy('id');
        $bank = $property?->settlementBankAccount;
        $refundBank = $contract->refundBankAccount;
        $deposit = $contract->deposit;
        $sharedUseAreas = trim((string) ($property?->shared_use_areas ?? ''));
        $leaseAncillarySpaces = trim((string) ($unit?->lease_ancillary_spaces ?? ''));
        $leaseAncillarySpacesLabel = $this->leaseAncillarySpacesLabel($leaseAncillarySpaces, $unit?->balcony_area_sqm);

        $rentConditions = $contract->conditions->sortBy('valid_from')->values()->map(fn (ContractCondition $row): array => $this->conditionRow($row))->all();
        $terminations = $contract->terminations->sortBy('received_on')->values()->map(fn ($row): array => $this->terminationRow($row))->all();

        return [
            'organization' => [
                ...$communication,
                'name' => $organizationName,
                'representedBy' => $organizationRepresentedBy,
                'signatureName' => $organizationSignatureName,
                'address' => $organizationAddress,
                'street' => trim((string) ($communication['street'] ?? '')),
                'houseNumber' => trim((string) ($communication['houseNumber'] ?? '')),
                'postalCode' => trim((string) ($communication['postalCode'] ?? '')),
                'city' => trim((string) ($communication['city'] ?? '')),
                'email' => trim((string) ($communication['email'] ?? '')),
                'phone' => trim((string) ($communication['phone'] ?? '')),
                'fax' => trim((string) ($communication['fax'] ?? '')),
                'website' => trim((string) ($communication['website'] ?? '')),
                'profileType' => trim((string) ($communication['profileType'] ?? '')),
                'profileTypeLabel' => trim((string) ($communication['profileTypeLabel'] ?? '')),
                'salutation' => trim((string) ($communication['salutation'] ?? '')),
                'title' => trim((string) ($communication['title'] ?? '')),
                'firstName' => trim((string) ($communication['firstName'] ?? '')),
                'lastName' => trim((string) ($communication['lastName'] ?? '')),
                'registeredName' => trim((string) ($communication['registeredName'] ?? '')),
                'tradingName' => trim((string) ($communication['tradingName'] ?? '')),
                'legalForm' => trim((string) ($communication['legalForm'] ?? '')),
                'taxNumber' => trim((string) ($communication['taxNumber'] ?? '')),
                'vatId' => trim((string) ($communication['vatId'] ?? '')),
                'economicId' => trim((string) ($communication['economicId'] ?? '')),
                'registrationType' => trim((string) ($communication['registrationType'] ?? '')),
                'registrationNumber' => trim((string) ($communication['registrationNumber'] ?? '')),
                'registrationCourt' => trim((string) ($communication['registrationCourt'] ?? '')),
                'legalFooter' => trim((string) ($communication['legalFooter'] ?? '')),
                'contact' => $organizationContact,
                'privacyContact' => collect([$organizationName, $organizationAddress, $organizationContact])->filter()->join("\n"),
            ],
            'contract' => [
                'id' => (string) $contract->id,
                'number' => (string) $contract->contract_number,
                'tenantNumber' => (string) $contract->contract_number,
                'type' => (string) $contract->contract_type,
                'typeLabel' => $this->contractTypeLabel((string) $contract->contract_type),
                'status' => (string) $contract->status,
                'statusLabel' => $this->contractStatusLabel((string) $contract->status),
                'termType' => (string) $contract->term_type,
                'termTypeLabel' => $this->termTypeLabel((string) $contract->term_type),
                'concludedOn' => $this->date($contract->concluded_on),
                'startsOn' => $this->date($contract->starts_on),
                'minimumMonths' => $minimumMonths,
                'minimumUntil' => $minimumUntil?->format('d.m.Y') ?? '',
                'fixedUntil' => $this->date($contract->fixed_until),
                'fixedReasonType' => (string) ($contract->fixed_reason_type ?? ''),
                'fixedReasonLabel' => $this->fixedReasonLabel($contract->fixed_reason_type),
                'fixedReasonText' => trim((string) ($contract->fixed_reason_text ?? '')),
                'rentAdjustmentModel' => (string) ($contract->rent_adjustment_model ?? ''),
                'rentAdjustmentLabel' => $this->rentAdjustmentLabel($contract->rent_adjustment_model),
                'handoverOn' => $this->date($contract->handed_over_at),
                'returnedOn' => $this->date($contract->returned_at),
                'confirmedEndOn' => $this->date($confirmedEnd),
                'hasPendingTermination' => (bool) $contract->has_pending_termination,
                'isFixed' => $contract->term_type === 'fixed',
                'isActive' => $contract->status === 'active',
            ],
            'property' => [
                'id' => (string) ($property?->id ?? ''),
                'number' => (string) ($property?->property_number ?? ''),
                'name' => (string) ($property?->name ?? ''),
                'type' => (string) ($property?->property_type ?? ''),
                'typeLabel' => $this->propertyTypeLabel($property?->property_type),
                'status' => (string) ($property?->status ?? ''),
                'statusLabel' => $this->simpleStatusLabel($property?->status),
                'address' => (string) ($property?->address ?? ''),
                'postalCode' => (string) ($property?->postal_code ?? ''),
                'city' => (string) ($property?->city ?? ''),
                'fullAddress' => (string) ($property?->full_address ?? ''),
                'constructionYear' => $property?->construction_year,
                'billingPeriod' => $property ? sprintf('%02d.%02d. – %02d.%02d.', (int) $property->billing_period_start_day, (int) $property->billing_period_start_month, (int) $property->billing_period_end_day, (int) $property->billing_period_end_month) : '',
                'billingMode' => (string) ($property?->billing_mode ?? ''),
                'billingModeLabel' => $this->billingModeLabel($property?->billing_mode),
                'heatingType' => (string) ($property?->heating_type ?? ''),
                'heatingTypeLabel' => $this->heatingTypeLabel($property?->heating_type),
                'heatingBillingType' => (string) ($property?->heating_billing_type ?? ''),
                'heatingBillingTypeLabel' => $this->heatingBillingTypeLabel($property?->heating_billing_type),
                'billingHeaderText' => trim((string) ($property?->billing_header_text ?? '')),
                'billingFooterText' => trim((string) ($property?->billing_footer_text ?? '')),
                'sharedUseAreas' => $sharedUseAreas,
                'sharedUseAreasLabel' => $sharedUseAreas !== '' ? $sharedUseAreas : 'Keine gesondert vereinbarten Gemeinschaftsbereiche',
            ],
            'unit' => [
                'id' => (string) ($unit?->id ?? ''),
                'number' => (string) ($unit?->unit_number ?? ''),
                'name' => (string) ($unit?->name ?? ''),
                'label' => collect([$unit?->unit_number, $unit?->name, $unit?->spatial_label])->filter()->join(' · '),
                'type' => (string) ($unit?->unit_type ?? ''),
                'typeLabel' => $this->unitTypeLabel($unit?->unit_type),
                'status' => (string) ($unit?->status ?? ''),
                'statusLabel' => $this->simpleStatusLabel($unit?->status),
                'condition' => (string) ($unit?->condition ?? ''),
                'conditionLabel' => $this->unitConditionLabel($unit?->condition),
                'floor' => $unit?->floor,
                'floorLabel' => (string) ($unit?->spatial_label ?? ''),
                'area' => $this->area($unit?->area_sqm),
                'livingArea' => $this->area($unit?->living_area_sqm),
                'usableArea' => $this->area($unit?->usable_area_sqm),
                'heatedArea' => $this->area($unit?->heated_area_sqm),
                'billingArea' => $this->area($unit?->billing_area_sqm),
                'balconyArea' => $this->area($unit?->balcony_area_sqm),
                'roomCount' => $unit?->room_count === null ? '' : $this->number($unit->room_count, 1),
                'bedrooms' => $unit?->bedrooms === null ? '' : (int) $unit->bedrooms,
                'bathrooms' => $unit?->bathrooms === null ? '' : (int) $unit->bathrooms,
                'separateToilet' => (bool) ($unit?->has_separate_toilet ?? false),
                'roomSummary' => $this->roomSummary($unit?->room_count, $unit?->bathrooms, (bool) ($unit?->has_separate_toilet ?? false)),
                'leaseAncillarySpaces' => $leaseAncillarySpaces,
                'leaseAncillarySpacesLabel' => $leaseAncillarySpacesLabel,
                'operatingCostBillable' => (bool) ($unit?->operating_cost_billable ?? false),
            ],
            'partyItems' => $partyItems,
            'tenantItems' => $tenantItems,
            'guarantorItems' => $guarantorItems,
            'tenant' => $primaryTenant,
            'tenants' => [
                'all' => collect($tenantItems)->pluck('display')->filter()->join("\n\n"),
                'signatureNames' => collect($tenantItems)->pluck('name')->filter()->join('; '),
                'allWithIds' => collect($tenantItems)->map(function (array $item): string {
                    $reference = trim((string) ($item['partnerNumber'] ?? ''));
                    return trim((string) ($item['name'] ?? '')).($reference !== '' ? " ({$reference})" : '');
                })->filter()->join("\n"),
                'count' => count($tenantItems),
            ],
            'guarantors' => ['all' => collect($guarantorItems)->pluck('name')->filter()->join(', '), 'count' => count($guarantorItems)],
            'rent' => [
                'base' => $this->money((float) ($condition?->base_rent_amount ?? 0)),
                'operatingAdvance' => $this->money((float) ($condition?->operating_cost_advance_amount ?? 0)),
                'heatingAdvance' => $this->money((float) ($condition?->heating_cost_advance_amount ?? 0)),
                'advance' => $this->money($advance),
                'garage' => $this->money((float) ($condition?->garage_amount ?? 0)),
                'parking' => $this->money((float) ($condition?->parking_space_amount ?? 0)),
                'other' => $this->money((float) ($condition?->other_amount ?? 0)),
                'cold' => $this->money($cold),
                'total' => $this->money($total),
                'paymentInterval' => (string) ($condition?->payment_interval ?? ''),
                'paymentIntervalLabel' => $this->paymentIntervalLabel($condition?->payment_interval),
                'validFrom' => $this->date($condition?->valid_from),
                'validUntil' => $this->date($condition?->valid_until),
                'changeReason' => (string) ($condition?->change_reason ?? ''),
                'changeReasonLabel' => $this->changeReasonLabel($condition?->change_reason),
                'note' => trim((string) ($condition?->note ?? '')),
            ],
            'rentConditions' => $rentConditions,
            'deposit' => [
                'exists' => $deposit !== null,
                'amount' => $this->money((float) ($deposit?->agreed_amount ?? 0)),
                'currency' => (string) ($deposit?->currency ?? ''),
                'dueFrom' => $this->date($deposit?->due_from),
                'installmentCount' => (int) ($deposit?->installment_count ?? 0),
                'installmentAmount' => $this->money((float) ($deposit?->installment_amount ?? 0)),
                'status' => (string) ($deposit?->status ?? ''),
                'statusLabel' => $this->depositStatusLabel($deposit?->status),
                'custodyType' => (string) ($deposit?->custody_type ?? ''),
                'custodyTypeLabel' => $this->depositCustodyTypeLabel($deposit?->custody_type),
                'reference' => trim((string) ($deposit?->reference ?? '')),
                'interestRelevant' => (bool) ($deposit?->interest_relevant ?? false),
                'interestAmount' => $this->money((float) ($deposit?->interest_amount ?? 0)),
                'plannedRefundOn' => $this->date($deposit?->planned_refund_on),
                'paidAmount' => $this->money((float) ($deposit?->paid_amount ?? 0)),
                'settledAmount' => $this->money((float) ($deposit?->settled_amount ?? 0)),
                'openAmount' => $this->money((float) ($deposit?->open_amount ?? 0)),
                'installments' => $deposit?->installments?->sortBy('installment_no')->values()->map(fn ($row): array => [
                    'number' => (int) $row->installment_no,
                    'dueOn' => $this->date($row->due_on),
                    'amount' => $this->money((float) $row->amount),
                    'status' => (string) $row->status,
                    'statusLabel' => $this->simpleStatusLabel($row->status),
                ])->all() ?? [],
            ],
            'termination' => [
                'exists' => $terminationModel !== null,
                'type' => (string) ($terminationModel?->termination_type ?? ''),
                'typeLabel' => $this->terminationTypeLabel($terminationModel?->termination_type),
                'initiatedBy' => (string) ($terminationModel?->initiated_by ?? ''),
                'initiatedByLabel' => $this->terminationInitiatorLabel($terminationModel?->initiated_by),
                'receivedOn' => $this->date($terminationModel?->received_on),
                'requestedEndOn' => $this->date($terminationModel?->requested_end_on),
                'systemDeterminedEndOn' => $this->date($terminationModel?->system_determined_end_on),
                'confirmedEndOn' => $this->date($terminationModel?->confirmed_end_on),
                'reasonType' => (string) ($terminationModel?->reason_type ?? ''),
                'reasonTypeLabel' => $this->terminationReasonLabel($terminationModel?->reason_type),
                'reasonText' => trim((string) ($terminationModel?->reason_text ?? '')),
                'note' => trim((string) ($terminationModel?->note ?? '')),
            ],
            'terminations' => $terminations,
            'bank' => [
                'accountHolder' => (string) ($bank?->account_holder ?? ''),
                'iban' => (string) ($bank?->iban ?? ''),
                'bic' => (string) ($bank?->bic ?? ''),
                'name' => (string) ($bank?->bank_name ?? ''),
                'paymentReference' => (string) $contract->contract_number,
            ],
            'refundBank' => [
                'exists' => $refundBank !== null,
                'id' => (string) ($refundBank?->id ?? ''),
                'accountHolder' => (string) ($refundBank?->account_holder ?? ''),
                'iban' => (string) ($refundBank?->iban ?? ''),
                'bic' => (string) ($refundBank?->bic ?? ''),
                'name' => (string) ($refundBank?->bank_name ?? ''),
            ],
            'meters' => $unit?->meters ? $unit->meters->sortBy('meter_number')->values()->map(function ($meter): array {
                $reading = $meter->latestReading;
                return [
                    'id' => (string) $meter->id,
                    'number' => (string) $meter->meter_number,
                    'type' => (string) $meter->meter_type,
                    'typeLabel' => $this->meterTypeLabel($meter->meter_type),
                    'unitLabel' => (string) $meter->unit_label,
                    'location' => (string) ($meter->location ?? ''),
                    'reading' => $reading?->reading_value === null ? '' : $this->number($reading->reading_value, 3),
                    'readingDate' => $this->date($reading?->reading_date),
                    'readingSource' => (string) ($reading?->source ?? ''),
                ];
            })->all() : [],
            'keys' => $unit?->keys ? $unit->keys->sortBy('label')->values()->map(function ($key) use ($keyMovementByKey): array {
                $movement = $keyMovementByKey->get((string) $key->id, ['issued' => 0, 'returned' => 0, 'open' => 0]);
                return [
                    'id' => (string) $key->id,
                    'label' => (string) $key->label,
                    'type' => (string) $key->key_type,
                    'typeLabel' => $this->keyTypeLabel($key->key_type),
                    'quantityTotal' => (int) $key->quantity_total,
                    'issuedForContract' => (int) $movement['issued'],
                    'returnedForContract' => (int) $movement['returned'],
                    'openForContract' => (int) $movement['open'],
                    'handoverQuantity' => '',
                    'handoverNote' => '',
                ];
            })->all() : [],
            'keyTransfers' => $contract->keyTransfers->sortBy('transfer_date')->values()->map(function ($transfer) use ($partyById): array {
                $partyName = (string) data_get($partyById->get((string) $transfer->contract_party_id), 'name', '');
                return [
                    'id' => (string) $transfer->id,
                    'date' => $this->date($transfer->transfer_date),
                    'direction' => (string) $transfer->direction,
                    'directionLabel' => $transfer->direction === 'returned' ? 'Rückgabe' : 'Ausgabe',
                    'keyLabel' => (string) ($transfer->unitKey?->label ?? ''),
                    'keyType' => (string) ($transfer->unitKey?->key_type ?? ''),
                    'keyTypeLabel' => $this->keyTypeLabel($transfer->unitKey?->key_type),
                    'partyName' => $partyName,
                    'quantity' => (int) $transfer->quantity,
                    'isTemporary' => (bool) $transfer->is_temporary,
                    'dueBackOn' => $this->date($transfer->due_back_on),
                    'notes' => trim((string) ($transfer->notes ?? '')),
                ];
            })->all(),
            'facilities' => $unit?->facilities ? $unit->facilities->sortBy('label')->values()->map(fn ($facility): array => [
                'id' => (string) $facility->id,
                'type' => (string) $facility->facility_type,
                'typeLabel' => $this->facilityTypeLabel($facility->facility_type),
                'label' => (string) ($facility->label ?: $this->facilityTypeLabel($facility->facility_type)),
                'manufacturer' => trim((string) ($facility->manufacturer ?? '')),
                'model' => trim((string) ($facility->model ?? '')),
                'serialNumber' => trim((string) ($facility->serial_number ?? '')),
                'location' => trim((string) ($facility->location ?? '')),
                'status' => (string) $facility->status,
                'statusLabel' => $this->facilityStatusLabel($facility->status),
                'installedOn' => $this->date($facility->installed_on),
                'expiresOn' => $this->date($facility->expires_on),
                'nextServiceOn' => $this->date($facility->next_service_on),
                'dueOn' => $this->date($facility->next_service_on ?? $facility->expires_on),
            ])->all() : [],
            'directAllocations' => $contract->wasteServices->sortBy('service_date')->values()->map(fn ($allocation): array => [
                'id' => (string) $allocation->id,
                'serviceDate' => $this->date($allocation->service_date),
                'title' => (string) $allocation->title,
                'referenceNumber' => trim((string) ($allocation->reference_number ?? '')),
                'amount' => $this->money((float) ($allocation->amount ?? 0)),
                'notes' => trim((string) ($allocation->notes ?? '')),
            ])->all(),
            'today' => ['date' => now()->format('d.m.Y'), 'isoDate' => now()->format('Y-m-d'), 'year' => now()->format('Y'), 'month' => now()->format('m')],
        ];
    }

    private function partyReferenceDate(Contract $contract): CarbonImmutable
    {
        $reference = CarbonImmutable::today();

        if (in_array($contract->status, ['ended', 'cancelled', 'archived'], true) && $contract->confirmed_end_on) {
            $end = CarbonImmutable::instance($contract->confirmed_end_on)->startOfDay();
            if ($end->lte($reference)) return $end;
        }

        // A lease document is normally prepared before the tenancy becomes
        // effective. Parties whose assignment begins on the contractual start
        // date must therefore already be available to the document context.
        if ($contract->starts_on) {
            $start = CarbonImmutable::instance($contract->starts_on)->startOfDay();
            if ($start->gt($reference)) return $start;
        }

        return $reference;
    }

    private function activeAt(ContractParty $party, CarbonImmutable $date): bool
    {
        return (! $party->valid_from || CarbonImmutable::instance($party->valid_from)->startOfDay()->lte($date))
            && (! $party->valid_until || CarbonImmutable::instance($party->valid_until)->endOfDay()->gte($date));
    }

    private function party(ContractParty $party): array
    {
        $partner = $party->businessPartner;
        if (! $partner) {
            return [...$this->emptyParty(), 'id' => (string) $party->id, 'role' => (string) $party->party_role, 'roleLabel' => $this->partyRoleLabel($party->party_role), 'validFrom' => $this->date($party->valid_from), 'validUntil' => $this->date($party->valid_until)];
        }

        $partner->loadMissing(['personProfile', 'organizationProfile', 'addresses', 'communicationChannels']);
        $address = $partner->addresses->filter(fn ($row): bool => $row->isCurrentlyValid())->sortByDesc('is_primary')->first();
        $channels = $partner->communicationChannels->filter(fn ($row): bool => $row->isCurrentlyValid());
        $email = $channels->where('type', 'email')->sortByDesc('is_primary')->first()?->value ?? '';
        $phone = $channels->whereIn('type', ['phone', 'mobile'])->sortByDesc('is_primary')->first()?->value ?? '';
        $streetLine = $address ? trim(collect([$address->street, $address->house_number])->filter()->join(' ')) : '';
        $addressText = $address ? collect([$streetLine, trim(collect([$address->postal_code, $address->city])->filter()->join(' '))])->filter()->join(', ') : '';
        $person = $partner->personProfile;
        $organization = $partner->organizationProfile;
        $name = (string) $partner->display_name;

        return [
            'id' => (string) $party->id, 'role' => (string) $party->party_role, 'roleLabel' => $this->partyRoleLabel($party->party_role),
            'partnerId' => (string) $partner->id, 'partnerNumber' => (string) $partner->partner_number, 'partnerKind' => (string) $partner->partner_kind,
            'name' => $name, 'salutation' => (string) ($person?->salutation ?? ''), 'title' => (string) ($person?->title ?? ''), 'firstName' => (string) ($person?->first_name ?? ''), 'lastName' => (string) ($person?->last_name ?? ''), 'birthDate' => $this->date($person?->birth_date),
            'registeredName' => (string) ($organization?->registered_name ?? ''), 'legalForm' => (string) ($organization?->legal_form ?? ''), 'vatId' => (string) ($organization?->vat_id ?? ''), 'taxNumber' => (string) ($organization?->tax_number ?? ''), 'registrationNumber' => (string) ($organization?->registration_number ?? ''), 'registrationCourt' => (string) ($organization?->registration_court ?? ''),
            'address' => $addressText, 'street' => (string) ($address?->street ?? ''), 'houseNumber' => (string) ($address?->house_number ?? ''), 'postalCode' => (string) ($address?->postal_code ?? ''), 'city' => (string) ($address?->city ?? ''), 'state' => (string) ($address?->state ?? ''), 'countryCode' => (string) ($address?->country_code ?? ''), 'email' => (string) $email, 'phone' => (string) $phone,
            'validFrom' => $this->date($party->valid_from), 'validUntil' => $this->date($party->valid_until),
            'display' => collect([$name, $addressText])->filter()->join("\n"),
        ];
    }

    private function emptyParty(): array
    {
        return [
            'id' => '', 'role' => '', 'roleLabel' => '', 'partnerId' => '', 'partnerNumber' => '', 'partnerKind' => '',
            'name' => '', 'salutation' => '', 'title' => '', 'firstName' => '', 'lastName' => '', 'birthDate' => '',
            'registeredName' => '', 'legalForm' => '', 'vatId' => '', 'taxNumber' => '', 'registrationNumber' => '',
            'registrationCourt' => '', 'address' => '', 'street' => '', 'houseNumber' => '', 'postalCode' => '',
            'city' => '', 'state' => '', 'countryCode' => '', 'email' => '', 'phone' => '', 'validFrom' => '',
            'validUntil' => '', 'display' => '',
        ];
    }

    private function conditionRow(ContractCondition $row): array
    {
        $cold = $row->monthlyColdAmount();
        $advance = (float) $row->operating_cost_advance_amount + (float) $row->heating_cost_advance_amount;
        return [
            'id' => (string) $row->id, 'validFrom' => $this->date($row->valid_from), 'validUntil' => $this->date($row->valid_until),
            'base' => $this->money((float) $row->base_rent_amount), 'operatingAdvance' => $this->money((float) $row->operating_cost_advance_amount),
            'heatingAdvance' => $this->money((float) $row->heating_cost_advance_amount), 'advance' => $this->money($advance),
            'garage' => $this->money((float) $row->garage_amount), 'parking' => $this->money((float) $row->parking_space_amount), 'other' => $this->money((float) $row->other_amount),
            'cold' => $this->money($cold), 'total' => $this->money($row->monthlyWarmAmount()), 'paymentInterval' => (string) $row->payment_interval,
            'paymentIntervalLabel' => $this->paymentIntervalLabel($row->payment_interval), 'changeReason' => (string) ($row->change_reason ?? ''), 'changeReasonLabel' => $this->changeReasonLabel($row->change_reason),
            'note' => trim((string) ($row->note ?? '')),
        ];
    }

    private function terminationRow($row): array
    {
        return [
            'id' => (string) $row->id, 'type' => (string) $row->termination_type, 'typeLabel' => $this->terminationTypeLabel($row->termination_type),
            'initiatedBy' => (string) $row->initiated_by, 'initiatedByLabel' => $this->terminationInitiatorLabel($row->initiated_by),
            'receivedOn' => $this->date($row->received_on), 'requestedEndOn' => $this->date($row->requested_end_on),
            'systemDeterminedEndOn' => $this->date($row->system_determined_end_on), 'confirmedEndOn' => $this->date($row->confirmed_end_on),
            'reasonType' => (string) ($row->reason_type ?? ''), 'reasonTypeLabel' => $this->terminationReasonLabel($row->reason_type),
            'reasonText' => trim((string) ($row->reason_text ?? '')), 'note' => trim((string) ($row->note ?? '')),
        ];
    }

    private function date(mixed $value): string
    {
        if (! $value) return '';
        return CarbonImmutable::parse($value)->format('d.m.Y');
    }

    private function money(float $value): string
    {
        return number_format($value, 2, ',', '.').' €';
    }

    private function number(float|int|string $value, int $decimals = 2): string
    {
        return number_format((float) $value, $decimals, ',', '.');
    }

    private function area(float|int|string|null $value): string
    {
        return $value === null ? '' : $this->number($value, 2).' m²';
    }

    private function leaseAncillarySpacesLabel(string $value, mixed $balconyArea): string
    {
        $parts = collect(preg_split('/[\r\n,;]+/u', $value) ?: [])
            ->map(fn (string $item): string => trim($item))
            ->filter()
            ->values();
        $containsBalcony = $parts->contains(fn (string $item): bool => str_contains(mb_strtolower($item), 'balkon'));
        if (! $containsBalcony && $balconyArea !== null && (float) $balconyArea > 0) {
            $parts->push('Balkon (Fläche '.$this->area($balconyArea).')');
        }
        return $parts->isNotEmpty() ? $parts->join(', ') : 'Keine gesonderten Nebenräume oder Außenflächen vereinbart';
    }

    private function roomSummary(mixed $rooms, mixed $bathrooms, bool $separateToilet): string
    {
        $parts = [];
        if ($rooms !== null) $parts[] = $this->number((float) $rooms, fmod((float) $rooms, 1.0) === 0.0 ? 0 : 1).' Zimmer';
        if ($bathrooms !== null && (int) $bathrooms > 0) $parts[] = ((int) $bathrooms).' '.((int) $bathrooms === 1 ? 'Bad' : 'Bäder');
        if ($separateToilet) $parts[] = 'separates WC';
        return implode(', ', $parts);
    }

    private function contractTypeLabel(string $value): string
    {
        return ['residential_lease' => 'Wohnraummiete', 'commercial_lease' => 'Gewerberaummiete', 'garage_lease' => 'Garagenmiete', 'parking_lease' => 'Stellplatzmiete', 'mixed_lease' => 'Mischmietvertrag', 'other_lease' => 'Sonstige Miete'][$value] ?? $value;
    }

    private function contractStatusLabel(string $value): string
    {
        return ['draft' => 'Entwurf', 'signature_pending' => 'Zur Unterschrift', 'active' => 'Aktiv', 'ended' => 'Beendet', 'cancelled' => 'Storniert', 'archived' => 'Archiviert'][$value] ?? $value;
    }

    private function termTypeLabel(string $value): string
    {
        return ['indefinite' => 'Unbefristet', 'fixed' => 'Befristet'][$value] ?? $value;
    }

    private function fixedReasonLabel(?string $value): string
    {
        if (!$value) return '';
        return ['owner_occupation' => 'Eigennutzung', 'construction_measure' => 'Baumaßnahme', 'service_housing' => 'Dienst-/Werkwohnung', 'commercial_agreement' => 'Gewerbliche Vereinbarung', 'other' => 'Sonstiges'][$value] ?? $value;
    }

    private function rentAdjustmentLabel(?string $value): string
    {
        if (!$value) return '';
        return ['none' => 'Keine automatische Anpassung', 'stepped_rent' => 'Staffelmiete', 'index_rent' => 'Indexmiete', 'free_agreement' => 'Freie Vereinbarung', 'not_applicable' => 'Nicht anwendbar'][$value] ?? $value;
    }

    private function paymentIntervalLabel(?string $value): string
    {
        if (!$value) return '';
        return ['monthly' => 'Monatlich', 'quarterly' => 'Vierteljährlich', 'half_yearly' => 'Halbjährlich', 'yearly' => 'Jährlich'][$value] ?? $value;
    }

    private function changeReasonLabel(?string $value): string
    {
        if (!$value) return '';
        return [
            'contract_start' => 'Vertragsbeginn',
            'step' => 'Staffel',
            'index_adjustment' => 'Indexanpassung',
            'rent_increase' => 'Mieterhöhung',
            'service_charge_adjustment' => 'Nebenkostenanpassung',
            'contract_addendum' => 'Vertragsnachtrag',
            'correction' => 'Korrektur',
            'other' => 'Sonstiges',
        ][$value] ?? $value;
    }

    private function partyRoleLabel(?string $value): string
    {
        if (!$value) return '';
        return ['tenant' => 'Mieter', 'guarantor' => 'Bürge', 'authorized_representative' => 'Bevollmächtigte Person', 'co_signer' => 'Mitunterzeichnende Person'][$value] ?? $value;
    }

    private function depositStatusLabel(?string $value): string
    {
        if (!$value) return '';
        return ['planned' => 'Vereinbart', 'partially_paid' => 'Teilweise bezahlt', 'paid' => 'Vollständig bezahlt', 'partially_settled' => 'Teilweise abgerechnet', 'settled' => 'Abgerechnet', 'waived' => 'Erlassen', 'cancelled' => 'Storniert'][$value] ?? $value;
    }

    private function depositCustodyTypeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['deposit_account' => 'Mietkautionskonto', 'savings_account' => 'Kautionssparbuch', 'bank_guarantee' => 'Bankbürgschaft', 'insurance_guarantee' => 'Mietkautionsversicherung', 'cash' => 'Barkaution', 'other' => 'Sonstige Verwahrung'][$value] ?? $value;
    }

    private function simpleStatusLabel(?string $value): string
    {
        if (!$value) return '';
        return ['active' => 'Aktiv', 'inactive' => 'Inaktiv', 'planned' => 'Geplant', 'archived' => 'Archiviert', 'available' => 'Verfügbar', 'occupied' => 'Belegt', 'maintenance' => 'Wartung', 'retired' => 'Außer Betrieb', 'open' => 'Offen', 'completed' => 'Erledigt', 'cancelled' => 'Storniert'][$value] ?? $value;
    }

    private function billingModeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['advance' => 'Vorauszahlung mit Abrechnung', 'flat_rate' => 'Pauschale', 'included' => 'In der Miete enthalten'][$value] ?? $value;
    }

    private function heatingTypeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['central' => 'Zentralheizung', 'district_heating' => 'Fernwärme', 'heat_pump' => 'Wärmepumpe', 'gas_floor' => 'Gasetagenheizung', 'electric' => 'Elektroheizung', 'other' => 'Sonstige'][$value] ?? $value;
    }

    private function heatingBillingTypeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['included' => 'Enthalten', 'advance' => 'Vorauszahlung', 'flat_rate' => 'Pauschale', 'direct' => 'Direktvertrag'][$value] ?? $value;
    }

    private function propertyTypeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['apartment_building' => 'Mehrfamilienhaus', 'single_family_house' => 'Einfamilienhaus', 'mixed_use' => 'Gemischt genutzt', 'commercial' => 'Gewerbeobjekt', 'other' => 'Sonstiges'][$value] ?? $value;
    }

    private function unitTypeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['apartment' => 'Wohnung', 'commercial' => 'Gewerbeeinheit', 'garage' => 'Garage', 'parking_space' => 'Stellplatz', 'storage' => 'Lager', 'other' => 'Sonstiges'][$value] ?? $value;
    }

    private function unitConditionLabel(?string $value): string
    {
        if (!$value) return '';
        return ['new' => 'Neubau / neu', 'renovated' => 'Renoviert', 'good' => 'Gut', 'normal' => 'Normal', 'needs_renovation' => 'Renovierungsbedürftig', 'unknown' => 'Nicht bewertet'][$value] ?? $value;
    }

    private function meterTypeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['electricity' => 'Strom', 'gas' => 'Gas', 'water_cold' => 'Kaltwasser', 'water_hot' => 'Warmwasser', 'heat' => 'Wärme', 'other' => 'Sonstiger Zähler'][$value] ?? $value;
    }

    private function keyTypeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['unit' => 'Wohnung', 'building' => 'Haus', 'mailbox' => 'Briefkasten', 'garage' => 'Garage', 'basement' => 'Keller', 'technical' => 'Technik', 'other' => 'Sonstiger Schlüssel'][$value] ?? $value;
    }

    private function facilityTypeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['kitchen' => 'Einbauküche', 'oven' => 'Backofen', 'cooktop' => 'Kochfeld', 'refrigerator' => 'Kühlschrank', 'dishwasher' => 'Geschirrspüler', 'washing_machine' => 'Waschmaschine', 'dryer' => 'Trockner', 'water_heater' => 'Warmwassergerät', 'boiler' => 'Therme / Heizgerät', 'intercom' => 'Gegensprechanlage', 'smoke_detector' => 'Rauchwarnmelder', 'other' => 'Sonstige Einrichtung'][$value] ?? $value;
    }

    private function facilityStatusLabel(?string $value): string
    {
        if (!$value) return '';
        return ['active' => 'In Betrieb', 'maintenance' => 'Wartung', 'defective' => 'Defekt', 'removed' => 'Entfernt'][$value] ?? $value;
    }

    private function terminationTypeLabel(?string $value): string
    {
        if (!$value) return '';
        return ['ordinary' => 'Ordentliche Kündigung', 'extraordinary' => 'Außerordentliche Kündigung', 'mutual' => 'Aufhebungsvertrag', 'automatic' => 'Automatisches Vertragsende'][$value] ?? $value;
    }

    private function terminationInitiatorLabel(?string $value): string
    {
        if (!$value) return '';
        return ['tenant' => 'Mieter', 'landlord' => 'Vermieter', 'both' => 'Beide Parteien', 'system' => 'System'][$value] ?? $value;
    }

    private function terminationReasonLabel(?string $value): string
    {
        if (!$value) return '';
        return ['tenant_notice' => 'Kündigung durch Mieter', 'landlord_notice' => 'Kündigung durch Vermieter', 'owner_occupation' => 'Eigenbedarf', 'payment_default' => 'Zahlungsverzug', 'breach' => 'Vertragsverletzung', 'mutual_agreement' => 'Einvernehmliche Aufhebung', 'fixed_term_expiry' => 'Ablauf Befristung', 'other' => 'Sonstiger Grund'][$value] ?? $value;
    }
}
