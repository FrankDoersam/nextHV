<?php

namespace App\Rest\Resources;

use App\Models\RentCondition;
use App\Rest\Fields\Currency;
use App\Rest\Filters\ExpressionFilter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Fields\Date;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Integer;
use Lomkit\Rest\Fields\Number;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Mutations\Contextual;
use Lomkit\Rest\Mutations\MutationContext;
use Lomkit\Rest\Relations\BelongsTo;

class RentConditionResource extends Resource
{
    public static string $model = RentCondition::class;

    public function fields(): array
    {
        return [
            Currency::make('monthly_total')->filterUsing(new ExpressionFilter(function (Builder $query): string {
                $column = fn (string $name): string => ExpressionFilter::column($query, $name);

                return 'CAST(ROUND(('.$column('base_rent').' + '.$column('service_charge').' + '.$column('heating_cost').') * (1 + '.$column('vat_rate').' / 100.0), 2) AS DECIMAL(20, 2))';
            }))->virtual()->readonly()->requires(['base_rent', 'service_charge', 'heating_cost', 'vat_rate'])->resolveUsing(fn (RentCondition $condition) => round(($condition->base_rent + $condition->service_charge + $condition->heating_cost) * (1 + $condition->vat_rate / 100), 2)),
            ID::make('id'),
            Integer::make('contract_id')->rules(Rule::exists('contracts', 'id')->whereNull('deleted_at'))->creationRules(Contextual::rule(fn (MutationContext $mutation): string => $mutation->depth === 0 ? 'required' : 'prohibited'))->updatable(false),
            Date::make('effective_from')->creationRules('required'),
            Currency::make('base_rent')->creationRules('required'),
            Currency::make('service_charge'),
            Currency::make('heating_cost'),
            Number::make('vat_rate')->rules('min:0', 'max:100', 'decimal:0,2'),
            Text::make('reason')->searchable()->nullable()->rules('max:190'),
            DateTime::make('created_at')->readonly(),
            DateTime::make('updated_at')->readonly(),
        ];
    }

    public function relations(): array
    {
        return [BelongsTo::make('contract', ContractResource::class)->onlyOperations()];
    }
}
