<?php

namespace App\Rest\Resources;

use App\Models\IdentityDocument;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Fields\Date;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Integer;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Relations\BelongsTo;

class IdentityDocumentResource extends Resource
{
    public static string $model = IdentityDocument::class;

    public function fields(): array
    {
        return [
            ID::make('id'),
            Integer::make('business_partner_id')->rules(Rule::exists('business_partners', 'id')->whereNull('deleted_at'))->creationRules('required')->updatable(false),
            Text::make('type')->rules('in:identity_card,passport,residence_permit,other'),
            Text::make('title')->searchable()->rules('max:160')->creationRules('required'),
            Text::make('document_number')->writeOnly()->nullable()->rules('max:80'),
            Text::make('number_last_four')->nullable()->readonly(),
            Text::make('issuing_country')->rules('size:2', 'uppercase'),
            Date::make('expires_on')->nullable(),
            Date::make('verified_on')->nullable()->rules('before_or_equal:today'),
            Text::make('mime_type')->nullable()->readonly(),
            Integer::make('size')->nullable()->readonly(),
            DateTime::make('created_at')->readonly(),
            DateTime::make('updated_at')->readonly(),
        ];
    }

    public function relations(): array
    {
        return [BelongsTo::make('businessPartner', BusinessPartnerResource::class)->onlyOperations()];
    }
}
