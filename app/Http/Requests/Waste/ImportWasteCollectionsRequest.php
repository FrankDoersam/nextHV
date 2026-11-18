<?php

namespace App\Http\Requests\Waste;

use App\Http\Requests\Imports\CsvImportRequest;

final class ImportWasteCollectionsRequest extends CsvImportRequest
{
    public function messages(): array
    {
        return [
            'csv.required' => 'Bitte übergeben Sie eine CSV-Datei für den Leerungsimport.',
            'csv.max' => 'Die CSV-Datei darf höchstens 5 MB groß sein.',
            'fileName.required' => 'Der Dateiname fehlt.',
            'fileHash.required' => 'Der Dateihash fehlt.',
        ];
    }
}
