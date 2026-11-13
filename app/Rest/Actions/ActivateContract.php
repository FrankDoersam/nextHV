<?php

namespace App\Rest\Actions;

use Illuminate\Support\Collection;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionTarget;
use Lomkit\Rest\Actions\ActionTransaction;
use Lomkit\Rest\Confirmation\Confirmation;

class ActivateContract extends Action
{
    public ?string $uriKey = 'activate';

    public ?string $name = 'Vertrag aktivieren';

    public ActionTarget $target = ActionTarget::Resources;

    public ?int $maxResources = 1;

    public ActionTransaction $transaction = ActionTransaction::Whole;

    public function authorizeEach(): ?string
    {
        return 'update';
    }

    public function confirmation(ActionFields $fields, int $rows): ?Confirmation
    {
        return Confirmation::make('Vertrag verbindlich aktivieren? Beteiligte und bisherige Konditionen werden historisch erhalten.');
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        foreach ($models as $contract) {
            app(\App\Domain\Contract\Actions\ActivateContract::class)->handle($contract);
        }
    }
}
