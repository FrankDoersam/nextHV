<?php

namespace App\Rest\Resources;

use App\Domain\Property\Enums\ManagementType;
use App\Domain\Property\Enums\PropertyStatus;
use App\Domain\Property\Enums\PropertyType;
use App\Models\Property;
use App\Models\Unit;
use App\Rest\Actions\ArchiveProperties;
use App\Rest\Actions\CloneProperty;
use App\Rest\Actions\CreatePropertyReport;
use App\Rest\Actions\InspectProperty;
use App\Rest\Filters\ExpressionFilter;
use App\Rest\Metrics\CollectionSummary;
use App\Rest\Metrics\GroupedCounts;
use App\Rest\Metrics\PropertyOverview;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Fields\Date;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\Enum;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Integer;
use Lomkit\Rest\Fields\MutationOperation;
use Lomkit\Rest\Fields\Number;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Mutations\Contextual;
use Lomkit\Rest\Mutations\MutationContext;
use Lomkit\Rest\Relations\HasMany;

class PropertyResource extends Resource
{
    public static string $model = Property::class;

    public function fields(): array
    {
        return [
            Text::make('full_address')->filterUsing(new ExpressionFilter(fn (Builder $query): string => ExpressionFilter::concat($query, [ExpressionFilter::column($query, 'street'), "' '", ExpressionFilter::column($query, 'house_number'), "', '", ExpressionFilter::column($query, 'postal_code'), "' '", ExpressionFilter::column($query, 'city')])))->virtual()->readonly()->requires(['street', 'house_number', 'postal_code', 'city'])->resolveUsing(fn (Property $property) => $property->street.' '.$property->house_number.', '.$property->postal_code.' '.$property->city),
            Integer::make('unit_count')->virtual()->readonly()->selectable(false)->filterable(['=', '!=', '>', '>=', '<', '<='])->filterUsing(fn (Builder $query, string $operator, mixed $value) => $query->has('units', $operator, (int) $value)),
            ID::make('id'), Text::make('code')->searchable()->rules('max:40', Contextual::rule(fn (MutationContext $m) => Rule::unique('properties', 'code')->ignore($m->key)))->creationRules('required')->updateRules('filled'),
            Text::make('name')->searchable()->rules('max:160')->creationRules('required')->updateRules('filled'),
            Enum::make('type', PropertyType::class), Enum::make('management_type', ManagementType::class), Enum::make('status', PropertyStatus::class),
            Text::make('street')->searchable()->rules('max:160')->creationRules('required')->updateRules('filled'), Text::make('house_number')->rules('max:20')->creationRules('required')->updateRules('filled'),
            Text::make('postal_code')->searchable()->rules('max:20')->creationRules('required')->updateRules('filled'), Text::make('city')->searchable()->rules('max:100')->creationRules('required')->updateRules('filled'), Text::make('country')->rules('size:2', 'uppercase'),
            Integer::make('construction_year')->nullable()->rules('min:1600', 'max:'.(date('Y') + 10)), Number::make('land_area')->nullable()->rules('min:0', 'max:9999999999'),
            Text::make('manager_name')->nullable()->rules('max:120'), Text::make('manager_email')->nullable()->rules('email', 'max:190'), Text::make('manager_phone')->nullable()->rules('max:50'),
            Text::make('heating_type')->nullable()->rules('max:60'), Text::make('energy_class')->nullable()->rules('in:A+,A,B,C,D,E,F,G,H'),
            Date::make('management_started_on')->nullable(), Date::make('next_inspection_on')->nullable(), Text::make('notes')->nullable()->rules('max:10000'),
            DateTime::make('created_at')->readonly(), DateTime::make('updated_at')->readonly(),
        ];
    }

    public function relations(): array
    {
        return [HasMany::make('units', UnitResource::class)->onlyOperations(MutationOperation::Create, MutationOperation::Update)->deletable()];
    }

    public function actions(): array
    {
        return [CloneProperty::class, ArchiveProperties::class, InspectProperty::class, CreatePropertyReport::class];
    }

    public function metrics(): array
    {
        return [PropertyOverview::class, new CollectionSummary([
            'total' => fn (Builder $query): int => $query->count(),
            'active' => fn (Builder $query): int => $query->where('status', 'active')->count(),
            'units' => fn (Builder $query): int => Unit::whereIn('property_id', $query->select('properties.id'))->count(),
            'area' => fn (Builder $query): float => (float) $query->sum('land_area'),
        ]), new GroupedCounts(['city', 'type'])];
    }
}
