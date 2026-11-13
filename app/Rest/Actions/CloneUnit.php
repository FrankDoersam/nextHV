<?php

namespace App\Rest\Actions;

use App\Models\Unit;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionResponse;
use Lomkit\Rest\Actions\ActionTarget;
use Lomkit\Rest\Fields\Text;

class CloneUnit extends Action
{
    public ?string $uriKey = 'clone';

    public ?string $name = 'Duplizieren';

    public ActionTarget $target = ActionTarget::Resources;

    public ?int $maxResources = 1;

    private array $created = [];

    public function authorizeEach(): ?string
    {
        return 'view';
    }

    public function abilities(): array
    {
        return ['viewAny', 'create'];
    }

    public function fields(): array
    {
        return [Text::make('code')->rules('required', 'max:40', 'max:40'), Text::make('name')->rules('required', 'max:160')];
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        $source = $models->first();
        if (Unit::withTrashed()->where('property_id', $source->property_id)->where('code', $fields->code)->exists()) {
            throw ValidationException::withMessages(['fields.code' => 'Diese Nummer ist bereits vergeben.']);
        } $this->created[] = app(\App\Domain\Property\Actions\CloneUnit::class)->handle($source, $fields->code, $fields->name)->id;
    }

    public function respond(ActionFields $fields, int $impacted): ?ActionResponse
    {
        return ActionResponse::data(['ids' => $this->created]);
    }
}
