<?php

namespace App\Rest\Actions;

use Illuminate\Support\Collection;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionTarget;
use Lomkit\Rest\Actions\ActionTransaction;
use Lomkit\Rest\Confirmation\Confirmation;
use Lomkit\Rest\Fields\Date;

class ConfirmTermination extends Action
{
    public ?string $uriKey = 'confirm';

    public ?string $name = 'Kündigung bestätigen';

    public ActionTarget $target = ActionTarget::Resources;

    public ?int $maxResources = 1;

    public ActionTransaction $transaction = ActionTransaction::Whole;

    public function authorizeEach(): ?string
    {
        return 'update';
    }

    public function fields(): array
    {
        return [Date::make('confirmed_end_on')->rules('required')];
    }

    public function confirmation(ActionFields $fields, int $rows): ?Confirmation
    {
        return Confirmation::make('Kündigung bestätigen und Vertragsende setzen?');
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        foreach ($models as $notice) {
            app(\App\Domain\Contract\Actions\ConfirmTermination::class)->handle($notice, (string) $fields->confirmed_end_on);
        }
    }
}
