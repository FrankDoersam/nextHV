<?php

namespace App\Rest\Resources;

use App\Models\PartnerRole;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Integer;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Relations\BelongsTo;

class PartnerRoleResource extends Resource
{
    public static string $model = PartnerRole::class;

    public function fields(): array
    {
        return [
            ID::make('id'),
            Integer::make('business_partner_id')->rules(Rule::exists('business_partners', 'id')->whereNull('deleted_at'))->creationRules('required')->updatable(false),
            Text::make('role')->searchable()->rules('in:tenant,owner,supplier,caretaker,guarantor')->creationRules('required'),
            DateTime::make('created_at')->readonly(),
            DateTime::make('updated_at')->readonly(),
        ];
    }

    public function relations(): array
    {
        return [BelongsTo::make('businessPartner', BusinessPartnerResource::class)->onlyOperations()];
    }
}
