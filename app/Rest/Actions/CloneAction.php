<?php

namespace App\Rest\Actions;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionResponse;
use Lomkit\Rest\Actions\ActionTarget;

/** Shared REST lifecycle; the concrete action owns fields and copy semantics. */
abstract class CloneAction extends Action
{
    public ?string $uriKey = 'clone';

    public ?string $name = 'Duplizieren';

    public ActionTarget $target = ActionTarget::Resources;

    public ?int $maxResources = 1;

    /** @var list<int|string> */
    private array $created = [];

    public function authorizeEach(): ?string
    {
        return 'view';
    }

    public function abilities(): array
    {
        return ['viewAny', 'create'];
    }

    final public function handle(ActionFields $fields, Collection $models): void
    {
        foreach ($models as $source) {
            try {
                $this->created[] = $this->cloneModel($source, $fields)->getKey();
            } catch (ValidationException $exception) {
                // Domain validation uses attribute names; REST action forms use fields.*.
                $errors = [];
                foreach ($exception->errors() as $key => $messages) {
                    $errors[str_starts_with($key, 'fields.') ? $key : 'fields.'.$key] = $messages;
                }
                throw ValidationException::withMessages($errors);
            }
        }
    }

    abstract protected function cloneModel(Model $source, ActionFields $fields): Model;

    public function respond(ActionFields $fields, int $impacted): ?ActionResponse
    {
        return ActionResponse::data(['ids' => $this->created]);
    }
}
