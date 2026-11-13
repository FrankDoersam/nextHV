<?php

namespace App\Rest\Actions;

use App\Domain\Property\Actions\CloneDefaults;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionResponse;
use Lomkit\Rest\Actions\ActionTarget;
use Lomkit\Rest\Fields\Boolean;
use Lomkit\Rest\Fields\Text;

class CloneProperty extends Action
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
        return [Text::make('code')->rules('sometimes', 'filled', 'max:40', Rule::unique('properties', 'code')), Text::make('name')->rules('sometimes', 'filled', 'max:160'), Boolean::make('with_units')->default(true)];
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        $source = $models->first();
        $defaults = app(CloneDefaults::class)->handle($source);
        $code = $fields->code ?? $defaults['code'];
        $name = $fields->name ?? $defaults['name'];
        $this->created[] = app(\App\Domain\Property\Actions\CloneProperty::class)->handle($source, $code, $name, $fields->with_units ?? true)->id;
    }

    public function respond(ActionFields $fields, int $impacted): ?ActionResponse
    {
        return ActionResponse::data(['ids' => $this->created]);
    }
}
