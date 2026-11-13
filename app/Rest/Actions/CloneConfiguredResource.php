<?php

namespace App\Rest\Actions;

use App\Framework\Crud\CloneService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionResponse;
use Lomkit\Rest\Actions\ActionTarget;
use Lomkit\Rest\Fields\Boolean;
use Lomkit\Rest\Fields\Text;

abstract class CloneConfiguredResource extends Action
{
    public ?string $uriKey = 'clone';

    public ?string $name = 'Duplizieren';

    public ActionTarget $target = ActionTarget::Resources;

    public ?int $maxResources = 1;

    protected string $cloneModel;

    protected string $nameField = 'name';

    protected string $resourceSlug;

    private array $created = [];

    private ?array $lastResult = null;

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
        $fields = [
            Text::make('code')->rules('required', 'max:40'),
            Text::make($this->nameField)->rules('required', 'max:160'),
        ];

        foreach ($this->cloneModel::crudRules()->cloneRelations() as $relation => $settings) {
            $fields[] = Boolean::make('with_'.$relation)->default($settings['default']);
        }

        return $fields;
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        $source = $models->first();
        if (! $source instanceof Model || ! is_a($source, $this->cloneModel)) {
            throw new \LogicException('Ungültige Klonquelle.');
        }

        $relations = [];
        foreach ($this->cloneModel::crudRules()->cloneRelations() as $relation => $settings) {
            if ($fields->{'with_'.$relation}) {
                $relations[] = $relation;
            }
        }

        $copy = app(CloneService::class)->handle($source, [
            'code' => $fields->code,
            $this->nameField => $fields->{$this->nameField},
        ], $relations);

        $this->created[] = $copy->getKey();
        $this->lastResult = [
            'id' => $copy->getKey(),
            'code' => $copy->code,
            $this->nameField => $copy->{$this->nameField},
            'copied_relations' => $relations,
        ];
    }

    public function respond(ActionFields $fields, int $impacted): ?ActionResponse
    {
        return ActionResponse::data([
            'ids' => $this->created,
            'message' => 'Datensatz erfolgreich dupliziert.',
            'record' => $this->lastResult,
            'navigate' => ['resource' => $this->resourceSlug, 'id' => $this->created[0]],
        ]);
    }
}
