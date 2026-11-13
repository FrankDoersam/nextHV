<?php

namespace App\Rest\Actions;

use App\Models\BusinessPartner;
use Illuminate\Support\Collection;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionResponse;
use Lomkit\Rest\Actions\ActionTarget;
use Lomkit\Rest\Fields\Boolean;

/** Read-only example: model in, structured message + object + navigation out. */
final class PartnerSummary extends Action
{
    public ?string $uriKey = 'summary';

    public ?string $name = 'Geschäftspartnerübersicht';

    public ActionTarget $target = ActionTarget::Resources;

    public ?int $maxResources = 1;

    private array $response = [];

    public function authorizeEach(): ?string
    {
        return 'view';
    }

    public function abilities(): array
    {
        return ['viewAny'];
    }

    public function fields(): array
    {
        return [Boolean::make('include_roles')->default(true)];
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        /** @var BusinessPartner $partner */
        $partner = $models->first();

        $activeCount = $partner->contractParties()
            ->whereHas('contract', fn ($q) => $q->where('status', 'active'))
            ->count();

        $record = [
            'id' => $partner->getKey(),
            'code' => $partner->code,
            'display_name' => $partner->display_name,
            'full_name' => $partner->full_name,
            'active_contracts' => $activeCount,
        ];

        if ($fields->include_roles) {
            $record['roles'] = $partner->roles()->pluck('role')->all();
        }

        $this->response = [
            'message' => 'Geschäftspartner '.$partner->full_name.': '.$activeCount.' aktive Vertragsbeteiligung(en).',
            'record' => $record,
            'navigate' => [
                'resource' => 'business-partners',
                'id' => $partner->getKey(),
            ],
        ];
    }

    public function respond(ActionFields $fields, int $impacted): ?ActionResponse
    {
        return ActionResponse::data($this->response);
    }
}
