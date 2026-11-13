<?php

namespace App\Rest\Resources;

use App\Models\ContractLink;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Integer;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Relations\BelongsTo;

class ContractLinkResource extends Resource
{
    public static string $model = ContractLink::class;

    public function fields(): array
    {
        return [
            ID::make('id'),
            Integer::make('contract_id')->rules(Rule::exists('contracts', 'id')->whereNull('deleted_at'))->creationRules('required')->updatable(false),
            Integer::make('related_contract_id')->rules(Rule::exists('contracts', 'id')->whereNull('deleted_at'))->creationRules('required'),
            Text::make('type')->rules('in:ancillary,successor,related'),
            Text::make('notes')->searchable()->nullable()->rules('max:10000'),
            DateTime::make('created_at')->readonly(),
            DateTime::make('updated_at')->readonly(),
        ];
    }

    public function relations(): array
    {
        return [
            BelongsTo::make('contract', ContractResource::class)->onlyOperations(),
            BelongsTo::make('relatedContract', ContractResource::class)->onlyOperations(),
        ];
    }
}
