<?php

namespace App\Http\Requests\Finance;

use Illuminate\Validation\Rule;

class GenerateOperatingCostStatementsRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([
            'propertyId' => ['required', 'uuid', Rule::exists('properties', 'id')->whereNull('deleted_at')],
            'periodFrom' => ['required', 'date'],
            'periodUntil' => ['required', 'date', 'after_or_equal:periodFrom'],
            'contractIds' => ['required', 'array', 'min:1', 'max:1000'],
            'contractIds.*' => ['required', 'uuid', Rule::exists('contracts', 'id')->whereNull('deleted_at')],
            'createdOn' => ['sometimes', 'date'],
        ]);
    }

    public function attributes(): array
    {
        return [
            'propertyId' => 'Objekt',
            'periodFrom' => 'Abrechnungsbeginn',
            'periodUntil' => 'Abrechnungsende',
            'contractIds' => 'Verträge',
            'createdOn' => 'Erstellungsdatum',
        ];
    }

    public function messages(): array
    {
        return [
            'propertyId.required' => 'Bitte wählen Sie ein Objekt aus.',
            'propertyId.exists' => 'Das ausgewählte Objekt existiert nicht mehr.',
            'periodFrom.required' => 'Bitte geben Sie den Beginn des Abrechnungszeitraums an.',
            'periodUntil.required' => 'Bitte geben Sie das Ende des Abrechnungszeitraums an.',
            'periodUntil.after_or_equal' => 'Das Ende des Abrechnungszeitraums darf nicht vor dem Beginn liegen.',
            'contractIds.required' => 'Bitte wählen Sie mindestens einen Vertrag aus.',
            'contractIds.min' => 'Bitte wählen Sie mindestens einen Vertrag aus.',
            'contractIds.*.exists' => 'Mindestens ein ausgewählter Vertrag existiert nicht mehr.',
        ];
    }
}
