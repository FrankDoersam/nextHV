<?php

namespace App\Rest\Actions;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\URL;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionResponse;
use Lomkit\Rest\Actions\ActionTarget;

class CreatePropertyReport extends Action
{
    public ?string $uriKey = 'report';

    public ?string $name = 'Objektbericht';

    public ActionTarget $target = ActionTarget::Resources;

    public ?int $maxResources = 1;

    private array $result = [];

    public function authorizeEach(): ?string
    {
        return 'view';
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        $property = $models->first();
        $this->result = ['ui' => ['type' => 'document', 'title' => 'Objektbericht · '.$property->name, 'mime' => 'application/pdf', 'name' => 'objekt-'.$property->id.'.pdf', 'url' => URL::temporarySignedRoute('properties.report', now()->addMinutes(10), ['property' => $property->id, 'user' => request()->user()->id], absolute: false)]];
    }

    public function respond(ActionFields $fields, int $impacted): ?ActionResponse
    {
        return ActionResponse::data($this->result);
    }
}
