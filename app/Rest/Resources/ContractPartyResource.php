<?php

namespace App\Rest\Resources;

use App\Models\ContractParty;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Fields\Boolean;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Integer;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Mutations\Contextual;
use Lomkit\Rest\Mutations\MutationContext;
use Lomkit\Rest\Relations\BelongsTo;

class ContractPartyResource extends Resource
{
    public static string $model = ContractParty::class;

    public function fields(): array
    {
        return [
            ID::make('id'),
            Integer::make('contract_id')->rules(Rule::exists('contracts', 'id')->whereNull('deleted_at'))->creationRules(Contextual::rule(fn (MutationContext $mutation): string => $mutation->depth === 0 ? 'required' : 'prohibited'))->updatable(false),
            Integer::make('business_partner_id')->rules(Rule::exists('business_partners', 'id')->whereNull('deleted_at'))->creationRules('required'),
            Text::make('role')->searchable()->rules('in:tenant,owner,guarantor')->creationRules('required'),
            Boolean::make('is_primary'),
            DateTime::make('created_at')->readonly(),
            DateTime::make('updated_at')->readonly(),
        ];
    }

    public function relations(): array
    {
        return [
            BelongsTo::make('businessPartner', BusinessPartnerResource::class)->onlyOperations(),
            BelongsTo::make('contract', ContractResource::class)->onlyOperations(),
        ];
    }
}
