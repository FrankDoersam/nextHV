<?php

namespace App\Framework\Import;

use App\Rest\Ui\ResourceMetadata;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Facades\Rest;
use Lomkit\Rest\Fields\Details\FieldDetails;
use Lomkit\Rest\Fields\WriteOperation;

class CsvImportService
{
    public function definition(string $name): array
    {
        $config = config('resource_features.'.$name);
        abort_unless(is_array($config) && ! empty($config['import']), 404);
        Gate::authorize('create', $config['resource']::$model);
        $resource = new $config['resource'];
        $metadata = (new ResourceMetadata($resource))->toArray();
        $fields = [];
        foreach ($resource->definition()->fields() as $field) {
            if (! in_array($field->name, $config['import']['fields'], true) || ! $field->isWritableOn(WriteOperation::Create) || in_array($field->name, $resource::newModel()->getHidden(), true)) {
                continue;
            }
            $detail = FieldDetails::of($field)->jsonSerialize();
            $label = __('validation.attributes.'.$field->name);
            $fields[$field->name] = [
                'name' => $field->name,
                'label' => str_starts_with($label, 'validation.') ? $detail['label'] : $label,
                'type' => $detail['type'],
                'nullable' => $detail['nullable'],
                'options' => ((array) $metadata['fields'])[$field->name]['options'] ?? [],
                'match' => $config['import']['relations'][$field->name]['match'] ?? [],
            ];
        }

        return [$config, $fields];
    }

    /** UTF-8, bounded, RFC-style quoting; never stores the uploaded file. */
    public function read(UploadedFile $file): array
    {
        $content = $file->get();
        if (! mb_check_encoding($content, 'UTF-8') || str_contains($content, "\0")) {
            throw ValidationException::withMessages(['file' => 'Bitte eine CSV-Datei in UTF-8 ohne Binärdaten verwenden.']);
        }
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);
        $stream = fopen('php://temp', 'r+');
        fwrite($stream, $content);
        rewind($stream);
        $first = fgets($stream);
        $delimiter = ',';
        $width = 0;
        foreach ([',', ';', "\t"] as $candidate) {
            $count = count(str_getcsv($first ?: '', $candidate, '"', ''));
            if ($count > $width) {
                $width = $count;
                $delimiter = $candidate;
            }
        }
        rewind($stream);
        $headers = array_map('trim', fgetcsv($stream, null, $delimiter, '"', '') ?: []);
        if (! count($headers) || count($headers) > 50 || in_array('', $headers, true) || count(array_unique($headers)) !== count($headers) || max(array_map('strlen', $headers) ?: [0]) > 160) {
            fclose($stream);
            throw ValidationException::withMessages(['file' => 'Die CSV benötigt eindeutige, nicht leere Spaltenüberschriften (höchstens 50).']);
        }
        $rows = [];
        while (($values = fgetcsv($stream, null, $delimiter, '"', '')) !== false) {
            if ($values === [null]) {
                continue;
            }
            if (count($rows) >= 100 || count($values) !== count($headers) || max(array_map(fn ($value) => strlen($value ?? ''), $values)) > 10000) {
                fclose($stream);
                throw ValidationException::withMessages(['file' => 'Höchstens 100 Datensätze mit gleicher Spaltenanzahl und maximal 10.000 Zeichen je Zelle sind erlaubt.']);
            }
            $rows[] = array_map(fn ($value) => trim($value ?? ''), $values);
        }
        fclose($stream);
        if ($rows === []) {
            throw ValidationException::withMessages(['file' => 'Die CSV enthält keine Datensätze.']);
        }

        return ['headers' => $headers, 'rows' => $rows];
    }

    public function preview(array $csv, array $mapping, array $config, array $fields, $user): array
    {
        $mapped = [];
        foreach ($mapping as $entry) {
            if (! isset($fields[$entry['field']]) || ! isset($csv['headers'][$entry['column']]) || isset($mapped[$entry['field']])) {
                throw ValidationException::withMessages(['mapping' => 'Jedes freigegebene Zielfeld darf genau einer vorhandenen CSV-Spalte zugeordnet sein.']);
            }
            if ($fields[$entry['field']]['match'] && ! in_array($entry['match'] ?? '', $fields[$entry['field']]['match'], true)) {
                throw ValidationException::withMessages(['mapping' => 'Bitte ein freigegebenes Suchmerkmal für die Beziehung wählen.']);
            }
            $mapped[$entry['field']] = $entry;
        }
        $rows = [];
        $payload = [];
        $cache = [];
        foreach ($csv['rows'] as $index => $values) {
            $attributes = [];
            $display = [];
            $errors = [];
            foreach ($mapped as $name => $entry) {
                $field = $fields[$name];
                $value = $values[$entry['column']];
                try {
                    if ($field['match'] && $value !== '') {
                        $key = $name.'|'.$entry['match'].'|'.$value;
                        $target = $config['import']['relations'][$name]['resource'];
                        $title = (new $target)->uiTitleField();
                        $page = $cache[$key] ??= Rest::search($target)->as($user)->payload([
                            'filters' => [['field' => $entry['match'], 'operator' => '=', 'value' => $value]],
                            'selects' => [['field' => 'id'], ['field' => $title]], 'limit' => 10,
                        ])->render();
                        if ($page['total'] !== 1) {
                            throw ValidationException::withMessages([$name => $field['label'].': '.($page['total'] ? 'Mehrere Treffer – bitte ein eindeutiges Merkmal verwenden.' : 'Kein zugänglicher Datensatz gefunden.')]);
                        }
                        $attributes[$name] = $page['data'][0]['id'];
                        $display[$name] = $page['data'][0][$title].' (#'.$attributes[$name].')';
                    } else {
                        $attributes[$name] = $this->convert($value, $field);
                        $display[$name] = $value;
                    }
                } catch (ValidationException $exception) {
                    $errors[$name] = array_merge(...array_values($exception->errors()));
                }
            }
            if ($errors === []) {
                try {
                    ImportMutationRequest::prepare($config['resource'], [$attributes], $user);
                } catch (ValidationException $exception) {
                    foreach ($exception->errors() as $key => $messages) {
                        $errors[preg_replace('/^mutate\.0\.attributes\./', '', $key)] = $messages;
                    }
                }
            }
            $rows[] = ['row' => $index + 2, 'values' => $display, 'errors' => (object) $errors];
            $payload[] = $attributes;
        }

        return ['rows' => $rows, 'payload' => $payload, 'valid' => ! array_filter($rows, fn ($row) => (array) $row['errors'] !== [])];
    }

    private function convert(string $value, array $field): mixed
    {
        if ($value === '') {
            return $field['nullable'] ? null : '';
        }
        foreach ($field['options'] as $option) {
            if (mb_strtolower((string) $option['value']) === mb_strtolower($value) || mb_strtolower($option['label']) === mb_strtolower($value)) {
                return $option['value'];
            }
        }
        if ($field['type'] === 'boolean') {
            return match (mb_strtolower($value)) {
                'ja', 'true', '1' => true, 'nein', 'false', '0' => false, default => $value
            };
        }
        if (in_array($field['type'], ['number', 'integer'], true)) {
            // Explicit decimal comma or decimal dot; no ambiguous thousands guessing.
            $number = str_replace(',', '.', $value);
            if (preg_match('/^-?\d+(\.\d+)?$/D', $number)) {
                return $field['type'] === 'integer' && ! str_contains($number, '.') ? (int) $number : (float) $number;
            }
        }
        if ($field['type'] === 'date' && preg_match('/^(\d{2})\.(\d{2})\.(\d{4})$/D', $value, $parts)) {
            return $parts[3].'-'.$parts[2].'-'.$parts[1];
        }

        return $value;
    }
}
