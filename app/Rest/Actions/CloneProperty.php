<?php

namespace App\Rest\Actions;

use App\Domain\Property\Actions\CloneDefaults;
use App\Domain\Property\Actions\CloneProperty as CopyProperty;
use App\Models\Property;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Fields\Boolean;
use Lomkit\Rest\Fields\Text;

class CloneProperty extends CloneAction
{
    public function fields(): array
    {
        return [Text::make('code')->rules('sometimes', 'filled', 'max:40', Rule::unique('properties', 'code')), Text::make('name')->rules('sometimes', 'filled', 'max:160'), Boolean::make('with_units')->default(true)];
    }

    protected function cloneModel(Model $source, ActionFields $fields): Property
    {
        /** @var Property $source */
        $defaults = app(CloneDefaults::class)->handle($source);

        return app(CopyProperty::class)->handle($source, $fields->code ?? $defaults['code'], $fields->name ?? $defaults['name'], $fields->with_units ?? true);
    }
}
