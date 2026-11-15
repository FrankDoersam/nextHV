<?php

namespace App\Framework\Import;

use App\Framework\FeatureRegistry;
use App\Rest\Ui\ResourceMetadata;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Facades\Rest;
use Lomkit\Rest\Fields\Details\FieldDetails;
use Lomkit\Rest\Fields\MutationOperation;
use Lomkit\Rest\Fields\WriteOperation;
use Lomkit\Rest\Mutations\Contextual;
use Lomkit\Rest\Mutations\MutationContext;

class CsvImportService
{
    public function __construct(private readonly FeatureRegistry $features) {}

    public function definition(string $name): array
    {
        $config = $this->features->get($name);
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
            $relation = $config['import']['relations'][$field->name] ?? null;
            $target = $relation ? new $relation['resource'] : null;
            $context = new MutationContext(MutationOperation::Create, null, 0);
            $rules = array_merge(...array_map(fn ($rule): array => $rule instanceof Contextual ? $rule->resolve($context) : [$rule], $field->getRules()->forWrite(WriteOperation::Create)));
            $fields[$field->name] = [
                'name' => $field->name,
                'label' => ResourceMetadata::label($field),
                'required' => in_array('required', $rules, true),
                'aliases' => $config['import']['aliases'][$field->name] ?? [],
                'type' => $detail['type'],
                'nullable' => $detail['nullable'],
                'options' => ((array) $metadata['fields'])[$field->name]['offeredOptions'] ?? ((array) $metadata['fields'])[$field->name]['options'] ?? [],
                'match' => $relation['match'] ?? [],
                'matchOptions' => array_map(fn (string $match): array => ['value' => $match, 'label' => ResourceMetadata::label($target->definition()->fields()->get($match))], $relation['match'] ?? []),
                'relation' => $relation ? ['name' => $relation['relation'], 'label' => $this->features->forResource($target)['label']] : null,
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

    public function preview(array $csv, array $mapping, array $config, array $fields, Authenticatable $user): array
    {
        $mapped = [];
        $columns = [];
        foreach ($mapping as $entry) {
            if (! isset($fields[$entry['field']]) || ! isset($csv['headers'][$entry['column']]) || isset($mapped[$entry['field']]) || isset($columns[$entry['column']])) {
                throw ValidationException::withMessages(['mapping' => 'Jedes freigegebene Zielfeld darf genau einer vorhandenen CSV-Spalte zugeordnet sein.']);
            }
            if ($fields[$entry['field']]['match'] && ! in_array($entry['match'] ?? '', $fields[$entry['field']]['match'], true)) {
                throw ValidationException::withMessages(['mapping' => 'Bitte ein freigegebenes Suchmerkmal für die Beziehung wählen.']);
            }
            $field = $fields[$entry['field']];
            $seen = [];
            foreach ($entry['values'] ?? [] as $valueMap) {
                $key = $this->normalize($valueMap['from']);
                if ($field['options'] === [] || isset($seen[$key]) || ! in_array($valueMap['to'], array_column($field['options'], 'value'), true)) {
                    throw ValidationException::withMessages(['mapping' => 'Bitte jede CSV-Ausprägung genau einem erlaubten Auswahlwert zuordnen.']);
                }
                $seen[$key] = true;
            }
            $mapped[$entry['field']] = $entry;
            $columns[$entry['column']] = true;
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
                $display[$name] = $value;
                try {
                    foreach ($entry['values'] ?? [] as $valueMap) {
                        if ($this->normalize($valueMap['from']) === $this->normalize($value)) {
                            $value = (string) $valueMap['to'];
                            break;
                        }
                    }
                    if ($field['match'] && $value !== '') {
                        $key = $name.'|'.$entry['match'].'|'.$value;
                        $target = $config['import']['relations'][$name]['resource'];
                        $title = (new $target)->uiTitleField();
                        $page = $cache[$key] ??= Rest::search($target)->as($user)->payload([
                            'filters' => [...$this->relationFilters($config, $name), ['field' => $entry['match'], 'operator' => '=', 'value' => $value]],
                            'selects' => [['field' => 'id'], ['field' => $title]], 'limit' => 10,
                        ])->render();
                        if ($page['total'] !== 1) {
                            throw ValidationException::withMessages([$name => $field['label'].': '.($page['total'] ? 'Mehrere Treffer – bitte ein eindeutiges Merkmal verwenden.' : 'Kein zugänglicher Datensatz gefunden.')]);
                        }
                        $attributes[$name] = $page['data'][0]['id'];
                        $display[$name] = $page['data'][0][$title].' (#'.$attributes[$name].')';
                    } else {
                        $attributes[$name] = $this->convert($value, $field);
                        $display[$name] = $this->display($attributes[$name], $field);
                    }
                } catch (AuthorizationException) {
                    $errors[$name] = [$field['label'].': Kein zugänglicher Datensatz gefunden.'];
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

    public function relationFilters(array $config, string $field): array
    {
        $resource = new $config['resource'];

        return $resource->definition()->fields()->get($field)->getMeta()['ui']['picker']['filters'] ?? [];
    }

    public function mapping(array $csv, array $fields): array
    {
        $mapping = [];
        $assigned = [];
        foreach ($csv['headers'] as $column => $header) {
            $candidates = array_filter($fields, fn (array $field): bool => ! isset($assigned[$field['name']]) && in_array($this->normalize($header), array_map($this->normalize(...), [$field['name'], $field['label'], ...$field['aliases']]), true));
            if (count($candidates) !== 1) {
                continue;
            }
            $field = array_values($candidates)[0];
            $mapping[] = ['column' => $column, 'field' => $field['name'], ...($field['match'] ? ['match' => $field['match'][0]] : [])];
            $assigned[$field['name']] = true;
        }

        return $mapping;
    }

    public function template(array $fields): string
    {
        $stream = fopen('php://temp', 'r+');
        fputcsv($stream, array_column($fields, 'label'), ';', '"', '');
        rewind($stream);
        $csv = stream_get_contents($stream);
        fclose($stream);

        return "\xEF\xBB\xBF".$csv;
    }

    private function normalize(string $value): string
    {
        return mb_strtolower(trim($value));
    }

    private function display(mixed $value, array $field): string
    {
        foreach ($field['options'] as $option) {
            if ($option['value'] === $value) {
                return $option['label'];
            }
        }
        if (is_bool($value)) {
            return $value ? 'Ja' : 'Nein';
        }

        return (string) ($value ?? '');
    }

    private function convert(string $value, array $field): mixed
    {
        if ($value === '') {
            return $field['nullable'] ? null : '';
        }
        if ($field['options'] !== []) {
            $exact = array_values(array_filter($field['options'], fn (array $option): bool => (string) $option['value'] === $value));
            $matches = $exact ?: array_values(array_filter($field['options'], fn (array $option): bool => $this->normalize((string) $option['value']) === $this->normalize($value) || $this->normalize($option['label']) === $this->normalize($value)));
            if (count($matches) === 1) {
                return $matches[0]['value'];
            }
            throw ValidationException::withMessages([$field['name'] => $field['label'].': „'.$value.'“ ist kein eindeutiger Auswahlwert. Bitte zuordnen: '.implode(', ', array_column($field['options'], 'label')).'.']);
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
