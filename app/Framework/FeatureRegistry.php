<?php

namespace App\Framework;

use App\Contracts\Framework\DefinesModelFeatures;
use App\Rest\Resources\Resource;
use Illuminate\Database\Eloquent\Relations\BelongsTo as EloquentBelongsTo;
use Illuminate\Routing\Router;
use Illuminate\Support\Str;
use LogicException;
use Lomkit\Rest\Fields\Field;
use Lomkit\Rest\Fields\WriteOperation;
use Lomkit\Rest\Http\Controllers\Controller;
use Lomkit\Rest\Relations\BelongsTo;

/** Uses registered REST routes, including cached routes. No second model/resource catalog. */
class FeatureRegistry
{
    private ?array $resources = null;

    private array $definitions = [];

    public function __construct(private readonly Router $router) {}

    public function all(): array
    {
        $definitions = [];
        foreach ($this->resources() as $name => $resource) {
            $definitions[$name] = $this->forResource($resource);
        }
        uasort($definitions, fn (array $a, array $b): int => ($a['search']['priority'] ?? 0) <=> ($b['search']['priority'] ?? 0));

        return $definitions;
    }

    public function get(string $name): ?array
    {
        $resource = $this->resources()[$name] ?? null;

        return $resource ? $this->forResource($resource) : null;
    }

    public function forResource(Resource $resource): array
    {
        if (isset($this->definitions[$resource::class])) {
            return $this->definitions[$resource::class];
        }
        $model = $resource::newModel();
        $config = $model instanceof DefinesModelFeatures ? $model::framework()->toArray() : ModelFeatures::make()->toArray();
        $config['resource'] = $resource::class;
        $config['label'] ??= Str::headline($resource->uiResourceName());
        if ($config['audit'] && ! in_array(HasModelFeatures::class, class_uses_recursive($model), true)) {
            throw new LogicException("{$resource->uiResourceName()}: auditing requires the HasModelFeatures trait.");
        }
        foreach ($config['audit'] as $field) {
            $declared = $this->field($resource, $field);
            if (str_contains($field, '.') || $declared->isVirtual()) {
                throw new LogicException("{$resource->uiResourceName()}: audit field {$field} must be a stored model attribute.");
            }
        }
        if ($config['search']) {
            $config['search']['title'] ??= $resource->uiTitleField();
            foreach ([$config['search']['title'], ...$config['search']['subtitle']] as $field) {
                $this->field($resource, $field, selectable: true);
            }
            $config['search']['includes'] = $this->includes([$config['search']['title'], ...$config['search']['subtitle']]);
        }
        if ($config['import']) {
            foreach ($config['import']['fields'] as $name) {
                $field = $this->field($resource, $name);
                if (! $field->isWritableOn(WriteOperation::Create)) {
                    throw new LogicException("{$resource->uiResourceName()}: import field {$name} is not writable on create.");
                }
            }
            $relations = [];
            foreach ($config['import']['relations'] as $name => $matches) {
                $relation = $resource->definition()->relation($name);
                $eloquent = $relation instanceof BelongsTo ? $model->{$name}() : null;
                if (! $eloquent instanceof EloquentBelongsTo || $matches === []) {
                    throw new LogicException("{$resource->uiResourceName()}: import relation {$name} must be a declared belongs-to with match fields.");
                }
                $foreignKey = $eloquent->getForeignKeyName();
                if (! in_array($foreignKey, $config['import']['fields'], true)) {
                    throw new LogicException("{$resource->uiResourceName()}: {$foreignKey} is missing from the import allow-list.");
                }
                $target = $relation->resource();
                foreach ($matches as $match) {
                    $field = $this->field($target, $match, selectable: true);
                    if (str_contains($match, '.') || ! in_array('=', array_map(fn ($operator) => $operator->value, $field->filterOperators()), true)) {
                        throw new LogicException("{$resource->uiResourceName()}: relation match {$match} must support equality filtering.");
                    }
                }
                $relations[$foreignKey] = ['resource' => $target::class, 'match' => $matches, 'relation' => $name];
            }
            // Foreign keys are always resolved through declared relations, never accepted as unchecked IDs.
            foreach ($resource->definition()->relations() as $relation) {
                if ($relation instanceof BelongsTo) {
                    $key = $model->{$relation->relation}()->getForeignKeyName();
                    if (in_array($key, $config['import']['fields'], true) && ! isset($relations[$key])) {
                        throw new LogicException("{$resource->uiResourceName()}: import field {$key} requires a relation declaration.");
                    }
                }
            }
            $config['import']['relations'] = $relations;
        }

        return $this->definitions[$resource::class] = $config;
    }

    private function field(Resource $resource, string $path, bool $selectable = false): Field
    {
        $parts = explode('.', $path);
        $name = array_pop($parts);
        foreach ($parts as $part) {
            $relation = $resource->definition()->relation($part);
            if (! $relation instanceof BelongsTo) {
                throw new LogicException("Invalid feature relation: {$path}.");
            }
            $resource = $relation->resource();
        }
        $field = $resource->definition()->fields()->find($name);
        if (! $field || in_array($name, $resource::newModel()->getHidden(), true) || ($selectable && ! $field->isSelectable())) {
            throw new LogicException("Invalid or hidden feature field: {$path}.");
        }

        return $field;
    }

    /** Derive bounded eager loads from the declared captions, not a second includes list. */
    private function includes(array $fields): array
    {
        $groups = [];
        foreach ($fields as $path) {
            if (str_contains($path, '.')) {
                [$name, $tail] = explode('.', $path, 2);
                $groups[$name][] = $tail;
            }
        }
        $includes = [];
        foreach ($groups as $name => $paths) {
            $includes[] = ['relation' => $name, 'selects' => array_map(fn ($field) => ['field' => $field], array_values(array_unique(['id', ...array_filter($paths, fn ($path) => ! str_contains($path, '.'))]))), 'includes' => $this->includes($paths)];
        }

        return $includes;
    }

    private function resources(): array
    {
        if ($this->resources !== null) {
            return $this->resources;
        }
        $resources = [];
        $seen = [];
        foreach ($this->router->getRoutes() as $route) {
            $controller = $route->getControllerClass();
            if (! $controller || ! is_subclass_of($controller, Controller::class)) {
                continue;
            }
            $class = $controller::resourceClass();
            if (isset($seen[$class]) || ! is_subclass_of($class, Resource::class)) {
                continue;
            }
            $seen[$class] = true;
            $resource = app($class);
            $name = $resource->uiResourceName();
            if (isset($resources[$name]) && $resource::class !== $resources[$name]::class) {
                throw new LogicException("Duplicate feature resource: {$name}.");
            }
            $resources[$name] = $resource;
        }

        return $this->resources = $resources;
    }
}
