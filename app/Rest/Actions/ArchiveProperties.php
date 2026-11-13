<?php

namespace App\Rest\Actions;

use Illuminate\Support\Collection;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionTarget;
use Lomkit\Rest\Actions\ActionTransaction;
use Lomkit\Rest\Confirmation\Confirmation;

class ArchiveProperties extends Action
{
    public ?string $uriKey = 'archive';

    public ?string $name = 'Archivieren';

    public ActionTarget $target = ActionTarget::Resources;

    public ActionTransaction $transaction = ActionTransaction::Whole;

    public ?int $maxResources = 100;

    public function authorizeEach(): ?string
    {
        return 'update';
    }

    public function confirmation(ActionFields $fields, int $rows): ?Confirmation
    {
        return Confirmation::make("{$rows} Objekte archivieren?");
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        foreach ($models as $model) {
            $model->update(['status' => 'archived']);
        }
    }
}
