<?php

namespace App\Rest\Actions;

use App\Domain\Property\Actions\CloneDefaults;
use App\Domain\Property\Actions\CloneUnit as CopyUnit;
use App\Models\Unit;
use Illuminate\Database\Eloquent\Model;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Fields\Text;

class CloneUnit extends CloneAction
{
    public function fields(): array
    {
        return [Text::make('code')->rules('sometimes', 'filled', 'max:40'), Text::make('name')->rules('sometimes', 'filled', 'max:160')];
    }

    protected function cloneModel(Model $source, ActionFields $fields): Unit
    {
        /** @var Unit $source */
        $defaults = app(CloneDefaults::class)->handle($source);

        return app(CopyUnit::class)->handle($source, $fields->code ?? $defaults['code'], $fields->name ?? $defaults['name']);
    }
}
