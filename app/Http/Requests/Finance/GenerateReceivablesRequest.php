<?php

namespace App\Http\Requests\Finance;

use Illuminate\Validation\Rule;

class GenerateReceivablesRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([
            'periodFrom' => ['required', 'date_format:Y-m'],
            'periodUntil' => ['required', 'date_format:Y-m', 'after_or_equal:periodFrom'],
            'contractIds' => ['nullable', 'array', 'max:1000', Rule::exists('contracts', 'id')->whereNull('deleted_at')],
            'contractIds.*' => ['uuid'],
            'propertyIds' => ['nullable', 'array', 'max:1000', Rule::exists('properties', 'id')->whereNull('deleted_at')],
            'propertyIds.*' => ['uuid'],
            'unitIds' => ['nullable', 'array', 'max:5000', Rule::exists('units', 'id')->whereNull('deleted_at')],
            'unitIds.*' => ['uuid'],
            'selectedKeys' => ['nullable', 'array', 'min:1', 'max:10000'],
            'selectedKeys.*' => ['required', 'string', 'max:240'],
        ]);
    }

    public function attributes(): array
    {
        return [
            'periodFrom' => 'Zeitraum von',
            'periodUntil' => 'Zeitraum bis',
            'contractIds' => 'Verträge',
            'propertyIds' => 'Objekte',
            'unitIds' => 'Einheiten',
            'selectedKeys' => 'Sollstellungen',
        ];
    }

    public function messages(): array
    {
        return [
            'periodFrom.required' => 'Bitte geben Sie den ersten Leistungsmonat an.',
            'periodUntil.required' => 'Bitte geben Sie den letzten Leistungsmonat an.',
            'periodUntil.after_or_equal' => 'Der letzte Leistungsmonat darf nicht vor dem ersten liegen.',
            'contractIds.exists' => 'Mindestens ein ausgewählter Vertrag existiert nicht mehr.',
            'propertyIds.exists' => 'Mindestens ein ausgewähltes Objekt existiert nicht mehr.',
            'unitIds.exists' => 'Mindestens eine ausgewählte Einheit existiert nicht mehr.',
            'selectedKeys.min' => 'Bitte wählen Sie mindestens eine Sollstellung aus.',
        ];
    }
}
