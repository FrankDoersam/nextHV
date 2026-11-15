<?php

namespace App\Framework\Import;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Authorization\ActingUser;
use Lomkit\Rest\Http\MutateResponse;
use Lomkit\Rest\Http\Requests\MutateRequest;
use Lomkit\Rest\Http\RestContext;

/** Internal gateway: imports use the same parser, rules, policies and mutation pipeline as REST. */
class ImportMutationRequest extends MutateRequest
{
    private string $resourceClass;

    private ?RestContext $importContext = null;

    public static function prepare(string $resource, array $rows, Authenticatable $user): self
    {
        $request = self::create('/', 'POST', ['mutate' => array_map(fn (array $attributes): array => ['operation' => 'create', 'attributes' => $attributes], $rows)]);
        $request->resourceClass = $resource;
        $request->setContainer(app());
        $request->setUserResolver(fn () => $user);
        $request->validateResolved();

        return $request;
    }

    public function execute(): int
    {
        $result = MutateResponse::of($this, $this->context()->resource($this->resourceClass));

        return count($result->operations);
    }

    public function context(): RestContext
    {
        return $this->importContext ??= new RestContext($this, $this->container, ActingUser::of('sanctum', $this->user()));
    }

    protected function controllerResourceClass(): string
    {
        return $this->resourceClass;
    }

    protected function failedValidation(Validator $validator): never
    {
        throw new ValidationException($validator);
    }
}
