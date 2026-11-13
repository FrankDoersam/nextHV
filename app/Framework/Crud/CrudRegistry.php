<?php

namespace App\Framework\Crud;

use Illuminate\Support\Str;
use Lomkit\Rest\Http\Controllers\Controller;

final class CrudRegistry
{
    public static function controllers(): array
    {
        $controllers = [];

        foreach (glob(app_path('Rest/Controllers/*Controller.php')) ?: [] as $file) {
            $controller = 'App\\Rest\\Controllers\\'.basename($file, '.php');

            if (! is_subclass_of($controller, Controller::class)) {
                continue;
            }

            $resource = $controller::$resource;
            $model = $resource::$model;
            $name = Str::kebab(Str::pluralStudly(class_basename($model)));

            if (isset($controllers[$name])) {
                throw new \LogicException('Doppelte CRUD-Ressource: '.$name);
            }

            $controllers[$name] = $controller;
        }

        return $controllers;
    }

    public static function rulesFor(string $resource): ?CrudRules
    {
        $controller = self::controllers()[$resource] ?? null;

        if (! $controller) {
            return null;
        }

        $resourceClass = $controller::$resource;
        $model = $resourceClass::$model;

        return method_exists($model, 'crudRules') ? $model::crudRules() : CrudRules::make();
    }

    public static function modelFor(string $resource): ?string
    {
        $controller = self::controllers()[$resource] ?? null;

        if (! $controller) {
            return null;
        }

        $resourceClass = $controller::$resource;

        return $resourceClass::$model;
    }
}
