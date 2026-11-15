<?php

namespace App\Rest\Actions;

use App\Rest\Ui\DocumentResult;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Actions\Action;
use Lomkit\Rest\Actions\ActionFields;
use Lomkit\Rest\Actions\ActionResponse;
use Lomkit\Rest\Actions\ActionTarget;

/** Read-only report link; generation stays in the protected document controller. */
abstract class PdfReportAction extends Action
{
    public ActionTarget $target = ActionTarget::Resources;

    public ?int $maxResources = 1;

    private ?DocumentResult $document = null;

    public function authorizeEach(): ?string
    {
        return 'view';
    }

    public function handle(ActionFields $fields, Collection $models): void
    {
        if ($models->count() !== 1) {
            throw ValidationException::withMessages(['resources' => 'Bitte genau einen Datensatz für den Bericht auswählen.']);
        }
        $this->document = $this->report($models->first(), $fields);
    }

    abstract protected function report(Model $model, ActionFields $fields): DocumentResult;

    public function respond(ActionFields $fields, int $impacted): ?ActionResponse
    {
        return $this->document ? ActionResponse::data($this->document->toArray()) : null;
    }
}
