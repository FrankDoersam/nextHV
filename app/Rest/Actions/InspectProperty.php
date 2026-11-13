<?php

namespace App\Rest\Actions;

use App\Models\Property;
use Illuminate\Support\Collection;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionResponse;
use Lomkit\Rest\Actions\ActionTarget;

/** Example custom action: the model is available here; the UI renders the typed result. */
class InspectProperty extends Action
{
    public ?string $uriKey = 'inspect';

    public ?string $name = 'Objekt-Check';

    public ActionTarget $target = ActionTarget::Resources;

    public ?int $maxResources = 1;

    private array $result = [];

    public function authorizeEach(): ?string
    {
        return 'view';
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        /** @var Property $property */ $property = $models->first();
        $property->loadCount('units')->loadSum('units', 'area');
        $this->result = ['ui' => ['type' => 'details', 'title' => 'Objekt-Check · '.$property->name, 'message' => 'Stammdaten und Einheiten wurden geprüft.', 'items' => [
            ['label' => 'Objekt', 'value' => $property->code], ['label' => 'Einheiten', 'value' => (string) $property->units_count], ['label' => 'Gesamtfläche', 'value' => number_format((float) $property->units_sum_area, 2, ',', '.').' m²'], ['label' => 'Energieklasse', 'value' => $property->energy_class ?: 'Noch nicht erfasst'], ['label' => 'Ansprechpartner', 'value' => $property->manager_name ?: 'Noch nicht zugeordnet'], ['label' => 'Nächste Prüfung', 'value' => $property->next_inspection_on?->format('d.m.Y') ?? 'Noch nicht geplant'],
        ]]];
    }

    public function respond(ActionFields $fields, int $impacted): ?ActionResponse
    {
        return ActionResponse::data($this->result);
    }
}
