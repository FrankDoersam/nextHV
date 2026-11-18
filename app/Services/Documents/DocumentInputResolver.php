<?php

namespace App\Services\Documents;

use DateTimeImmutable;
use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;

final class DocumentInputResolver
{
    /**
     * @param array<int, array<string, mixed>> $definitions
     * @param array<string, mixed> $context
     * @param array<string, mixed> $submitted
     * @return array{values:array<string, string|bool|null>,renderValues:array<string, string|bool|null>,context:array<string, mixed>}
     */
    public function resolve(array $definitions, array $context, array $submitted = [], bool $strict = true): array
    {
        $definitions = $this->normalizedDefinitions($definitions);
        $known = array_fill_keys(array_column($definitions, 'key'), true);
        $unknown = array_values(array_diff(array_keys($submitted), array_keys($known)));

        if ($strict && $unknown !== []) {
            throw ValidationException::withMessages([
                'inputs' => 'Nicht freigegebene Dokument-Eingaben: '.implode(', ', $unknown),
            ]);
        }

        $values = [];
        $renderValues = [];
        $errors = [];

        foreach ($definitions as $definition) {
            $key = $definition['key'];
            $hasSubmittedValue = array_key_exists($key, $submitted);
            $value = $hasSubmittedValue
                ? $submitted[$key]
                : $this->defaultValue($definition, $context);

            if (($definition['useDefaultWhenEmpty'] ?? false) && $this->isEmpty($value)) {
                $value = $this->defaultValue($definition, $context);
            }

            [$rawValue, $renderValue] = $this->normalizeValue($definition, $value, $errors);
            if ($strict && ($definition['required'] ?? false) && $this->isEmpty($rawValue)) {
                $errors['inputs.'.$key] = '„'.$definition['label'].'“ ist erforderlich.';
            }

            $values[$key] = $rawValue;
            $renderValues[$key] = $renderValue;
        }

        if ($strict && $errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $resolvedContext = $context;
        foreach ($renderValues as $key => $value) {
            data_set($resolvedContext, 'inputs.'.$key, $value);
        }

        return ['values' => $values, 'renderValues' => $renderValues, 'context' => $resolvedContext];
    }

    /** @param array<int, array<string, mixed>> $definitions */
    public function inputPaths(array $definitions): array
    {
        return array_map(
            static fn (array $definition): string => 'inputs.'.$definition['key'],
            $this->normalizedDefinitions($definitions),
        );
    }

    /** @param array<int, array<string, mixed>> $definitions */
    private function normalizedDefinitions(array $definitions): array
    {
        $normalized = [];
        $seen = [];

        foreach ($definitions as $index => $definition) {
            if (! is_array($definition)) {
                throw ValidationException::withMessages(['inputDefinitions' => 'Eine Dokument-Eingabe ist ungültig.']);
            }

            $key = trim((string) ($definition['key'] ?? ''));
            $label = trim((string) ($definition['label'] ?? ''));
            $type = (string) ($definition['type'] ?? 'text');

            if (! preg_match('/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/', $key) || isset($seen[$key])) {
                throw ValidationException::withMessages(['inputDefinitions.'.$index.'.key' => 'Der Eingabeschlüssel ist ungültig oder doppelt.']);
            }
            if ($label === '' || mb_strlen($label) > 120 || ! in_array($type, ['text', 'textarea', 'date', 'datetime', 'select', 'boolean'], true)) {
                throw ValidationException::withMessages(['inputDefinitions.'.$index => 'Die Definition der Dokument-Eingabe ist ungültig.']);
            }

            $defaultSource = trim((string) ($definition['defaultSource'] ?? ''));
            if ($defaultSource !== '' && ! preg_match('/^[A-Za-z0-9_.-]{1,120}$/', $defaultSource)) {
                throw ValidationException::withMessages(['inputDefinitions.'.$index.'.defaultSource' => 'Die Standard-Datenquelle ist ungültig.']);
            }

            $options = array_values(array_filter($definition['options'] ?? [], static fn (mixed $option): bool => is_array($option)));
            $normalized[] = [
                ...$definition,
                'key' => $key,
                'label' => $label,
                'type' => $type,
                'group' => trim((string) ($definition['group'] ?? 'Dokumentangaben')) ?: 'Dokumentangaben',
                'required' => (bool) ($definition['required'] ?? false),
                'defaultSource' => $defaultSource !== '' ? $defaultSource : null,
                'useDefaultWhenEmpty' => (bool) ($definition['useDefaultWhenEmpty'] ?? false),
                'options' => $options,
            ];
            $seen[$key] = true;
        }

        return $normalized;
    }

    /** @param array<string, mixed> $definition */
    private function defaultValue(array $definition, array $context): mixed
    {
        $source = $definition['defaultSource'] ?? null;
        if (is_string($source) && $source !== '') {
            $fromContext = data_get($context, $source);
            if ($fromContext !== null && $fromContext !== '') {
                return $fromContext;
            }
        }

        return Arr::get($definition, 'defaultValue');
    }

    /** @param array<string, mixed> $definition @param array<string, string> $errors */
    private function normalizeValue(array $definition, mixed $value, array &$errors): array
    {
        $key = (string) $definition['key'];
        $type = (string) $definition['type'];

        if ($type === 'boolean') {
            $normalized = filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
            if ($value !== null && $value !== '' && $normalized === null) {
                $errors['inputs.'.$key] = '„'.$definition['label'].'“ muss Ja oder Nein sein.';
            }

            return [$normalized ?? false, $normalized ?? false];
        }

        if (is_array($value) || is_object($value)) {
            $errors['inputs.'.$key] = '„'.$definition['label'].'“ besitzt kein gültiges Format.';
            return [null, null];
        }

        $normalized = trim((string) ($value ?? ''));
        $limit = $type === 'textarea' ? 5000 : 500;
        if (mb_strlen($normalized) > $limit) {
            $errors['inputs.'.$key] = '„'.$definition['label'].'“ ist zu lang.';
        }

        if ($type === 'select' && $normalized !== '') {
            $allowed = array_map(static fn (array $option): string => (string) ($option['value'] ?? ''), $definition['options'] ?? []);
            if (! in_array($normalized, $allowed, true)) {
                $errors['inputs.'.$key] = '„'.$definition['label'].'“ enthält keine gültige Auswahl.';
            }
        }

        if ($type === 'date' && $normalized !== '') {
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $normalized);
            if ($date && $date->format('Y-m-d') === $normalized) {
                return [$normalized, $date->format('d.m.Y')];
            }

            $germanDate = DateTimeImmutable::createFromFormat('!d.m.Y', $normalized);
            if ($germanDate && $germanDate->format('d.m.Y') === $normalized) {
                return [$germanDate->format('Y-m-d'), $normalized];
            }

            $errors['inputs.'.$key] = '„'.$definition['label'].'“ enthält kein gültiges Datum.';
            return [$normalized, $normalized];
        }

        if ($type === 'datetime' && $normalized !== '') {
            foreach (['!Y-m-d\\TH:i', '!Y-m-d H:i', '!d.m.Y H:i'] as $format) {
                $dateTime = DateTimeImmutable::createFromFormat($format, $normalized);
                if (! $dateTime) {
                    continue;
                }

                $expected = match ($format) {
                    '!Y-m-d\\TH:i' => $dateTime->format('Y-m-d\\TH:i'),
                    '!Y-m-d H:i' => $dateTime->format('Y-m-d H:i'),
                    default => $dateTime->format('d.m.Y H:i'),
                };
                if ($expected !== $normalized) {
                    continue;
                }

                return [$dateTime->format('Y-m-d\\TH:i'), $dateTime->format('d.m.Y H:i')];
            }

            $errors['inputs.'.$key] = '„'.$definition['label'].'“ enthält kein gültiges Datum mit Uhrzeit.';
            return [$normalized, $normalized];
        }

        return [$normalized, $normalized];
    }

    private function isEmpty(mixed $value): bool
    {
        return $value === null || $value === '';
    }
}
