<?php

namespace App\Rest\Resources;

use App\Models\Contract;
use App\Rest\Actions\ActivateContract;
use App\Rest\Fields\Currency;
use App\Rest\Metrics\CollectionSummary;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Fields\Date;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Integer;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Mutations\Contextual;
use Lomkit\Rest\Mutations\MutationContext;
use Lomkit\Rest\Mutations\MutationNode;
use Lomkit\Rest\Relations\BelongsTo;
use Lomkit\Rest\Relations\HasMany;

class ContractResource extends Resource
{
    public static string $model = Contract::class;

    public function mutating(MutationNode $entry, Model $model): void
    {
        $candidate = clone $model;
        $candidate->fill($entry->attributes ?? []);
        if ($model->exists && $model->status !== 'draft' && $candidate->isDirty(['unit_id', 'starts_on', 'ends_on', 'type', 'deposit', 'notice_period_months', 'payment_day', 'signed_on', 'minimum_term_until', 'notice_to'])) {
            throw ValidationException::withMessages(['contract' => 'Vertragsstammdaten sind nach Aktivierung geschützt. Konditionen separat fortschreiben.']);
        }
    }

    public function fields(): array
    {
        return [
            ID::make('id'),
            Text::make('code')->searchable()->rules('max:40', Contextual::rule(fn (MutationContext $m) => Rule::unique('contracts', 'code')->ignore($m->key)))->creationRules('required')->updateRules('filled'),
            Integer::make('unit_id')->rules(Rule::exists('units', 'id')->whereNull('deleted_at'))->creationRules('required'),
            Text::make('type')->rules('in:residential_lease,commercial_lease,garage_lease,parking_lease,storage_lease'),
            Text::make('status')->rules('in:draft,active,ended')->readonly(),
            Date::make('signed_on')->nullable(),
            Date::make('minimum_term_until')->nullable(),
            Text::make('notice_to')->rules('in:month_end,quarter_end,year_end,any'),
            Date::make('starts_on')->creationRules('required'),
            Date::make('ends_on')->nullable(),
            Integer::make('notice_period_months')->rules('min:0', 'max:120'),
            Integer::make('payment_day')->rules('min:1', 'max:28'),
            Currency::make('deposit'),
            Text::make('deposit_status')->rules('in:outstanding,partial,received,returned'),
            Text::make('notes')->nullable()->rules('max:10000'),
            DateTime::make('created_at')->readonly(),
            DateTime::make('updated_at')->readonly(),
        ];
    }

    public function relations(): array
    {
        return [
            BelongsTo::make('unit', UnitResource::class)->onlyOperations(),
            HasMany::make('parties', ContractPartyResource::class)->onlyOperations(),
            HasMany::make('conditions', RentConditionResource::class)->onlyOperations(),
            HasMany::make('links', ContractLinkResource::class)->onlyOperations(),
            HasMany::make('incomingLinks', ContractLinkResource::class)->onlyOperations(),
            HasMany::make('terminations', TerminationNoticeResource::class)->onlyOperations(),
        ];
    }

    public function metrics(): array
    {
        return [new CollectionSummary([
            'total' => fn (Builder $query): int => $query->count(),
            'active' => fn (Builder $query): int => $query->where('status', 'active')->count(),
            'draft' => fn (Builder $query): int => $query->where('status', 'draft')->count(),
            'deposits' => fn (Builder $query): float => (float) $query->sum('deposit'),
        ])];
    }

    public function actions(): array
    {
        return [ActivateContract::class];
    }
}
