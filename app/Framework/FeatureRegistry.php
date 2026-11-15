<?php

namespace App\Framework;

use App\Contracts\Framework\HasAuditTrail;
use App\Contracts\Framework\HasCsvImport;
use App\Contracts\Framework\HasFeatureAvailability;
use App\Contracts\Framework\HasGlobalSearch;
use App\Rest\Resources\Resource;
use Illuminate\Contracts\Container\Container;
use Illuminate\Routing\Router;
use LogicException;
use Lomkit\Rest\Http\Controllers\Controller;

/** Uses registered REST routes, including cached routes. No second model/resource catalog. */
class FeatureRegistry
{
    private ?array $resources = null;

    private array $definitions = [];

    public const RESOURCE_TAG = 'framework.resources';

    public function __construct(private readonly Router $router, private readonly Container $container, private readonly FeatureDefinitionCompiler $compiler) {}

    public function all(?Feature $only = null, bool $applyAvailability = true): array
    {
        $definitions = [];
        foreach ($this->resources() as $name => $resource) {
            if ($only === Feature::Search && ! $resource instanceof HasGlobalSearch) {
                continue;
            }
            if ($only === Feature::Import && ! $resource instanceof HasCsvImport) {
                continue;
            }
            if ($only === Feature::Audit && ! $resource::newModel() instanceof HasAuditTrail) {
                continue;
            }
            $definitions[$name] = $this->forResource($resource, $applyAvailability);
        }
        uasort($definitions, fn (array $a, array $b): int => [($a['search']['priority'] ?? 0), $a['name']] <=> [($b['search']['priority'] ?? 0), $b['name']]);

        return $definitions;
    }

    public function get(string $name): ?array
    {
        $resource = $this->resources()[$name] ?? null;

        return $resource ? $this->forResource($resource) : null;
    }

    /** Only immutable declarations are memoized. Availability is evaluated on every access. */
    public function forResource(Resource $resource, bool $applyAvailability = true): array
    {
        $config = $this->definitions[$resource::class] ??= $this->compiler->compile($resource);
        $config['label'] = $resource->uiLabel();
        if ($applyAvailability && $resource instanceof HasFeatureAvailability) {
            $context = new FeatureContext(auth()->user(), app()->getLocale());
            foreach (Feature::cases() as $feature) {
                if (! empty($config[$feature->value]) && ! $resource->featureAvailable($feature, $context)) {
                    $config[$feature->value] = $feature === Feature::Audit ? [] : null;
                }
            }
        }

        return $config;
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

        foreach ($this->container->tagged(self::RESOURCE_TAG) as $resource) {
            if (! $resource instanceof Resource) {
                throw new LogicException('Tagged framework resources must extend the REST Resource.');
            }
            $name = $resource->uiResourceName();
            if (isset($resources[$name]) && $resource::class !== $resources[$name]::class) {
                throw new LogicException("Duplicate feature resource: {$name}.");
            }
            $resources[$name] = $resource;
        }

        return $this->resources = $resources;
    }
}
