<?php

namespace App\Rest\Resources;

use App\Models\BusinessPartner;
use App\Rest\Actions\CloneBusinessPartner;
use App\Rest\Actions\PartnerSummary;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Fields\Date;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Mutations\Contextual;
use Lomkit\Rest\Mutations\MutationContext;
use Lomkit\Rest\Relations\HasMany;

class BusinessPartnerResource extends Resource
{
    public static string $model = BusinessPartner::class;

    public function fields(): array
    {
        return [
            ID::make('id'),
            Text::make('code')->searchable()->rules('max:40', Contextual::rule(fn (MutationContext $m) => Rule::unique('business_partners', 'code')->ignore($m->key)))->creationRules('required')->updateRules('filled'),
            Text::make('kind')->rules('in:person,company'),
            Text::make('display_name')->searchable()->rules('max:160')->creationRules('required')->updateRules('filled'),
            Text::make('full_name')->readonly(),
            Text::make('first_name')->nullable()->rules('max:100'),
            Text::make('last_name')->nullable()->rules('max:100'),
            Text::make('company_name')->nullable()->rules('max:160'),
            Text::make('phone')->nullable()->rules('max:50'),
            Text::make('street')->nullable()->rules('max:160'),
            Text::make('postal_code')->nullable()->rules('max:20'),
            Text::make('city')->nullable()->rules('max:100'),
            Text::make('commercial_register')->nullable()->rules('max:100'),
            Date::make('birth_date')->nullable()->rules('before_or_equal:today'),
            Text::make('email')->searchable()->nullable()->rules('email', 'max:190'),
            Text::make('country')->rules('size:2', 'uppercase'),
            Text::make('notes')->nullable()->rules('max:10000'),
            DateTime::make('created_at')->readonly(),
            DateTime::make('updated_at')->readonly(),
        ];
    }

    public function actions(): array
    {
        return [CloneBusinessPartner::class, PartnerSummary::class];
    }

    public function relations(): array
    {
        return [
            HasMany::make('roles', PartnerRoleResource::class)->onlyOperations(),
            HasMany::make('contractParties', ContractPartyResource::class)->onlyOperations(),
            HasMany::make('identityDocuments', IdentityDocumentResource::class)->onlyOperations(),
        ];
    }
}
