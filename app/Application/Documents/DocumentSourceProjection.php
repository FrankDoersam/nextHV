<?php

namespace App\Application\Documents;

use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\DirectAllocation;
use App\Models\Document;
use App\Models\DunningNotice;
use App\Models\IncomingInvoice;
use App\Models\Letter;
use App\Models\Meter;
use App\Models\OpenItem;
use App\Models\OperatingCostStatementUnit;
use App\Models\OrganizationSetting;
use App\Models\Property;
use App\Models\Unit;
use App\Models\UnitFacility;
use App\Models\WasteContainer;
use Illuminate\Database\Eloquent\Model;

/**
 * Authoritative read-only document origin projection.
 *
 * Uses the existing polymorphic document ownership and immutable source
 * snapshots. Callers never need a separate lookup per document or client-side
 * guesses based on a PHP class name. Relation traversal is strictly eager-only.
 */
final class DocumentSourceProjection
{
    private const TYPES = [
        'business-partners' => BusinessPartner::class,
        'contracts' => Contract::class,
        'properties' => Property::class,
        'units' => Unit::class,
        'meters' => Meter::class,
        'unit-facilities' => UnitFacility::class,
        'incoming-invoices' => IncomingInvoice::class,
        'waste-containers' => WasteContainer::class,
        'open-items' => OpenItem::class,
        'direct-allocations' => DirectAllocation::class,
        'organization-settings' => OrganizationSetting::class,
        'dunning-notices' => DunningNotice::class,
        'operating-cost-statement-units' => OperatingCostStatementUnit::class,
        'letters' => Letter::class,
    ];

    private const TITLES = [
        'business-partners' => 'Geschäftspartner',
        'contracts' => 'Vertrag',
        'properties' => 'Objekt',
        'units' => 'Einheit',
        'meters' => 'Zähler',
        'unit-facilities' => 'Einrichtung',
        'incoming-invoices' => 'Eingangsrechnung',
        'waste-containers' => 'Mülltonne',
        'open-items' => 'Offener Posten',
        'direct-allocations' => 'Direktumlage',
        'organization-settings' => 'Vermieterdaten',
        'dunning-notices' => 'Mahnung',
        'operating-cost-statement-units' => 'Betriebskostenabrechnung',
        'letters' => 'Brief',
    ];

    /** Keep the attachment service's existing labels and canonical links in one owner. */
    public static function targetDescriptor(string $type, Model $target): array
    {
        return [
            'resource' => $type,
            'id' => (string) $target->getKey(),
            'label' => self::label($type, $target) ?: (string) $target->getKey(),
            'href' => self::href($type, (string) $target->getKey()),
        ];
    }

    /** @return array{sourceTypeLabel: string, sourceLabel: string, sourceContext: ?string, sourceHref: ?string, sourceState: string} */
    public static function document(Document $document): array
    {
        $rawType = trim((string) $document->getRawOriginal('documentable_type'));
        $id = trim((string) $document->getRawOriginal('documentable_id'));
        if ($rawType === '' || $id === '') {
            return [
                'sourceTypeLabel' => 'Zentrale Ablage',
                'sourceLabel' => 'Noch keinem Datensatz zugeordnet',
                'sourceContext' => null,
                'sourceHref' => null,
                'sourceState' => 'library',
            ];
        }

        $type = self::type($rawType);
        $meta = is_array($document->metadata) ? $document->metadata : [];
        $relationLoaded = $document->relationLoaded('documentable');
        $target = $relationLoaded ? $document->getRelation('documentable') : null;
        $available = $target instanceof Model;
        $snapshot = trim((string) ($meta['targetLabel'] ?? ''));
        $label = $available ? self::label($type, $target) : '';
        $label = $label !== '' ? $label : ($snapshot !== '' ? $snapshot : self::historicalLabel($type, $meta));
        $label = $label !== '' ? $label : 'Zuordnung ohne Bezeichnung';
        $context = $available ? self::context($type, $target) : null;
        $context ??= self::historicalContext($type, $meta);

        // An actually queried but missing/soft-deleted owner is historic.
        // An immediately uploaded model may not have loaded the relation yet.
        $missing = $relationLoaded && ! $available;
        $href = $missing ? null : self::href($type, $id);

        return [
            'sourceTypeLabel' => self::TITLES[$type] ?? 'Weitere Zuordnung',
            'sourceLabel' => $label,
            'sourceContext' => $context,
            'sourceHref' => $href,
            'sourceState' => $missing || ! isset(self::TITLES[$type]) ? 'unavailable' : 'linked',
        ];
    }

    private static function type(string $raw): string
    {
        if (isset(self::TYPES[$raw])) return $raw;
        // Older records may still store an FQCN instead of the current morph alias.
        foreach (self::TYPES as $type => $class) {
            if ($class === $raw) return $type;
        }
        return '';
    }

    private static function label(string $type, Model $target): string
    {
        $values = match ($type) {
            'business-partners' => [$target->partner_number, $target->display_name],
            'contracts' => [$target->contract_number],
            'properties' => [$target->property_number, $target->name],
            'units' => [$target->unit_number, $target->name],
            'meters' => [$target->meter_number],
            'unit-facilities' => [$target->label ?: $target->facility_type, $target->serial_number],
            'incoming-invoices' => [$target->number],
            'waste-containers' => [$target->container_number],
            'open-items' => [$target->number],
            'direct-allocations' => [$target->title],
            'organization-settings' => ['Vermieter- und Unternehmensdaten'],
            'dunning-notices' => [$target->number],
            'operating-cost-statement-units' => [self::loaded($target, 'statement')?->number],
            'letters' => [$target->number, $target->subject],
            default => [],
        };
        return self::join($values);
    }

    private static function href(string $type, string $id): ?string
    {
        return match ($type) {
            'business-partners' => '/master-data/business-partners/'.$id,
            'contracts' => '/master-data/contracts/'.$id,
            'properties' => '/master-data/properties/'.$id,
            'units' => '/master-data/units/'.$id,
            'meters' => '/master-data/meters/'.$id,
            'unit-facilities' => '/master-data/facilities/'.$id,
            'waste-containers' => '/master-data/waste-containers/'.$id,
            'incoming-invoices' => '/finance/incoming-invoices?invoice='.$id,
            'open-items' => '/finance/receivables/open-items?openItem='.$id,
            'direct-allocations' => '/finance/direct-allocations?directAllocation='.$id,
            'organization-settings' => '/settings/general',
            'dunning-notices' => '/finance/receivables/dunning?dunningNotice='.$id,
            'operating-cost-statement-units' => '/finance/receivables/statements/'.$id,
            'letters' => '/communication/letters/'.$id,
            default => null,
        };
    }

    private static function context(string $type, Model $target): ?string
    {
        if ($type === 'contracts' && $target instanceof Contract) {
            $unit = self::loaded($target, 'mainUnit');
            if (! $unit && $target->relationLoaded('units')) {
                $assignments = $target->getRelation('units')->sortBy('sort_order');
                $assignment = $assignments->firstWhere('object_role', 'main_rental_object') ?? $assignments->first();
                $unit = $assignment ? self::loaded($assignment, 'unit') : null;
            }
            return self::propertyContext($unit ? self::loaded($unit, 'property') : null);
        }
        if (in_array($type, ['units', 'meters', 'unit-facilities', 'incoming-invoices', 'waste-containers', 'direct-allocations'], true)) {
            return self::propertyContext(self::loaded($target, 'property')
                ?? self::loaded(self::loaded($target, 'unit'), 'property'));
        }
        if ($type === 'open-items') {
            $contract = self::loaded($target, 'contract');
            return $contract ? 'Vertrag '.(string) $contract->contract_number : null;
        }
        if ($type === 'dunning-notices' && $target instanceof DunningNotice) {
            return self::join([
                $target->contract_number ? 'Vertrag '.$target->contract_number : null,
                $target->property_label ?: null,
            ]);
        }
        if ($type === 'operating-cost-statement-units') {
            $contract = self::loaded($target, 'contract');
            return $contract ? 'Vertrag '.(string) $contract->contract_number : null;
        }
        if ($type === 'letters') {
            $contract = self::loaded($target, 'contract');
            return $contract ? 'Vertrag '.(string) $contract->contract_number : null;
        }
        return null;
    }

    private static function loaded(?Model $model, string $relation): ?Model
    {
        if (! $model || ! $model->relationLoaded($relation)) return null;
        $related = $model->getRelation($relation);
        return $related instanceof Model ? $related : null;
    }

    private static function propertyContext(?Model $property): ?string
    {
        if (! $property) return null;
        $label = self::join([$property->property_number, $property->name]);
        return $label === '' ? null : 'Objekt '.$label;
    }

    private static function historicalLabel(string $type, array $metadata): string
    {
        $key = match ($type) {
            'contracts' => 'contractNumber',
            'properties' => 'propertyNumber',
            'units' => 'unitNumber',
            'meters' => 'meterNumber',
            'unit-facilities' => 'facilityLabel',
            'incoming-invoices' => 'incomingInvoiceNumber',
            'waste-containers' => 'wasteContainerNumber',
            'open-items' => 'openItemNumber',
            'direct-allocations' => 'referenceNumber',
            'dunning-notices' => 'noticeNumber',
            'operating-cost-statement-units' => 'statementNumber',
            'letters' => 'letterNumber',
            'business-partners' => 'businessPartnerNumber',
            default => '',
        };
        return $key !== '' ? trim((string) ($metadata[$key] ?? '')) : '';
    }

    private static function historicalContext(string $type, array $metadata): ?string
    {
        $property = trim((string) ($metadata['propertyLabel'] ?? ''));
        $contract = in_array($type, ['dunning-notices', 'operating-cost-statement-units', 'open-items', 'letters'], true)
            ? trim((string) ($metadata['contractNumber'] ?? '')) : '';
        $context = self::join([
            $contract !== '' ? 'Vertrag '.$contract : null,
            $property !== '' ? 'Objekt '.$property : null,
        ]);
        return $context !== '' ? $context : null;
    }

    private static function join(array $values): string
    {
        return implode(' · ', array_filter(array_map(
            static fn ($value): string => trim((string) ($value ?? '')),
            $values,
        ), static fn (string $value): bool => $value !== ''));
    }
}
