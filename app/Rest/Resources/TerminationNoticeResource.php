<?php

namespace App\Rest\Resources;

use App\Models\TerminationNotice;
use App\Rest\Actions\ConfirmTermination;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Fields\Date;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Integer;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Relations\BelongsTo;

class TerminationNoticeResource extends Resource
{
    public static string $model = TerminationNotice::class;

    public function fields(): array
    {
        return [
            ID::make('id'),
            Integer::make('contract_id')->rules(Rule::exists('contracts', 'id')->whereNull('deleted_at'))->creationRules('required')->updatable(false),
            Text::make('status')->rules('in:received,confirmed,withdrawn')->readonly()->meta(['ui' => ['optionLabels' => ['received' => 'Eingegangen']]]),
            Text::make('type')->rules('in:ordinary,extraordinary,mutual')->meta(['ui' => ['optionLabels' => ['mutual' => 'Aufhebungsvereinbarung']]]),
            Text::make('initiated_by')->rules('in:tenant,landlord,mutual'),
            Date::make('declared_on')->creationRules('required'),
            Date::make('received_on')->creationRules('required'),
            Date::make('requested_end_on')->creationRules('required'),
            Date::make('confirmed_end_on')->nullable()->readonly(),
            Text::make('delivery_method')->rules('in:letter,registered_letter,personal,email,other'),
            Text::make('reason')->searchable()->rules('max:190')->creationRules('required'),
            Text::make('notes')->nullable()->rules('max:10000'),
            DateTime::make('created_at')->readonly(),
            DateTime::make('updated_at')->readonly(),
        ];
    }

    public function relations(): array
    {
        return [BelongsTo::make('contract', ContractResource::class)->onlyOperations()];
    }

    public function actions(): array
    {
        return [ConfirmTermination::class];
    }
}
