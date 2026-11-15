<?php

namespace App\Rest\Actions;

use App\Rest\Ui\DocumentResult;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\URL;
use Lomkit\Rest\Actions\ActionFields;

class CreatePropertyReport extends PdfReportAction
{
    public ?string $uriKey = 'report';

    public ?string $name = 'Objektbericht';

    protected function report(Model $model, ActionFields $fields): DocumentResult
    {
        return new DocumentResult(
            title: 'Objektbericht · '.$model->name,
            url: URL::temporarySignedRoute('properties.report', now()->addMinutes(10), ['property' => $model->getKey(), 'user' => request()->user()->id], absolute: false),
            name: 'objekt-'.$model->getKey().'.pdf',
        );
    }
}
