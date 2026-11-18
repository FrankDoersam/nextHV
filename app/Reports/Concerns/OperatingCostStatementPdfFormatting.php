<?php

namespace App\Reports\Concerns;

use App\Support\Formatting\OperatingCostDisplayFormatter;


trait OperatingCostStatementPdfFormatting
{
    private function costSubtitle(array $cost): string
    {
        $invoiceLines = $this->invoicePresentationLines($cost);
        $lines = $this->splitPdfLines((string) ($cost['details'] ?? ''));
        if ($invoiceLines !== []) {
            $lines = array_values(array_filter(
                $lines,
                fn (string $line): bool => ! $this->isInvoicePresentationDetailLine($line),
            ));
        }

        $calculationLine = trim((string) ($cost['calculationLine'] ?? ''));
        if ($calculationLine === '') {
            $calculationLine = trim((string) ($cost['berechnung'] ?? ''));
        }

        if ($calculationLine !== '') {
            $lines = array_values(array_filter(
                $lines,
                fn (string $line): bool => ! $this->isCalculationDetailLine($line),
            ));
            $lines[] = $this->normalizeMeasurementPrecision($calculationLine);
        } else {
            $lines = array_values(array_filter(array_map(
                fn (string $line): string => $this->compactAllocationDetailLine($line),
                $lines,
            ), fn (string $line): bool => trim($line) !== ''));

            $key = trim((string) ($cost['allocationKeyName'] ?? $cost['allocationKey'] ?? ''));
            if ($key !== '' && ! $this->hasLinePrefix($lines, 'Schlüssel:') && ! $this->hasLinePrefix($lines, 'Umlage:')) {
                $lines[] = 'Schlüssel: '.$key;
            }

            $formula = $this->standardizedAllocationCalculation($cost);
            if ($formula !== null && ! in_array($formula, $lines, true)) {
                $lines[] = $formula;
            }
        }

        $usageLine = $this->invoiceUsagePeriodLine($cost);
        if ($usageLine !== null && ! $this->hasLinePrefix($lines, 'Nutzung:')) {
            array_unshift($lines, $usageLine);
        }

        return implode("\n", array_values(array_filter([...$invoiceLines, ...$lines])));
    }

    private function invoiceUsagePeriodLine(array $cost): ?string
    {
        if ((array) ($cost['invoicePresentation'] ?? []) === []) return null;

        $period = (array) ($this->data['usagePeriod'] ?? []);
        $from = $period['from'] ?? null;
        $until = $period['until'] ?? null;
        if (! $from || ! $until) return null;

        return 'Nutzung: '.$this->date($from).'–'.$this->date($until);
    }

    private function isCalculationDetailLine(string $line): bool
    {
        $line = trim($line);

        return str_starts_with($line, 'Schlüssel:')
            || str_starts_with($line, 'Berechnung:')
            || str_starts_with($line, 'Rechenweg:')
            || preg_match('/^(\d+)\.\s+/u', $line) === 1;
    }

    private function standardizedAllocationCalculation(array $cost): ?string
    {
        $total = array_key_exists('totalAmount', $cost) ? (float) $cost['totalAmount'] : null;
        $allocated = array_key_exists('allocatedAmount', $cost) ? (float) $cost['allocatedAmount'] : null;
        if ($total === null || $allocated === null || $total <= 0) return null;

        $factors = [];
        $splitPercent = (float) ($cost['splitPercent'] ?? 100);
        if ($splitPercent < 99.999999) {
            $factors[] = OperatingCostDisplayFormatter::percent($splitPercent / 100);
        }

        $factor = (float) ($cost['factor'] ?? 0);
        if ($factor > 0 && $factor < 0.999999) {
            $factors[] = OperatingCostDisplayFormatter::percent($factor);
        }

        return OperatingCostDisplayFormatter::calculationLine([
            'base' => OperatingCostDisplayFormatter::money($total),
            'factors' => $factors,
            'result' => OperatingCostDisplayFormatter::money($allocated),
        ]);
    }

    /** @return array<int,string> */
    private function invoicePresentationLines(array $cost): array
    {
        $presentation = (array) ($cost['invoicePresentation'] ?? []);
        if ($presentation === []) return [];

        $supplier = trim((string) ($presentation['supplier'] ?? ''));
        $number = trim((string) ($presentation['number'] ?? ''));
        $position = trim((string) ($presentation['position'] ?? ''));
        $periodFrom = $presentation['periodFrom'] ?? null;
        $periodUntil = $presentation['periodUntil'] ?? null;

        $period = null;
        $statementPeriod = (array) ($this->data['period'] ?? []);
        $statementFrom = $statementPeriod['from'] ?? null;
        $statementUntil = $statementPeriod['until'] ?? null;
        $hasDifferentPeriod = ($periodFrom && $statementFrom && (string) $periodFrom !== (string) $statementFrom)
            || ($periodUntil && $statementUntil && (string) $periodUntil !== (string) $statementUntil);
        if (($periodFrom || $periodUntil) && ($hasDifferentPeriod || ! $statementFrom || ! $statementUntil)) {
            $from = $periodFrom ? $this->date($periodFrom) : '-';
            $until = $periodUntil ? $this->date($periodUntil) : '-';
            $period = $from.'–'.$until;
        }

        $line = collect([
            $supplier !== '' ? 'Lieferant: '.$supplier : null,
            $number !== '' ? 'RG-Nr.: '.$number : null,
            $position !== '' ? 'Position: '.$position : null,
            $period !== null ? 'Abrechnungszeitraum: '.$period : null,
        ])->filter()->join(' · ');

        return $line !== '' ? [$line] : [];
    }

    private function isInvoicePresentationDetailLine(string $line): bool
    {
        $line = trim($line);

        foreach (['Lieferant:', 'RG-Nr.:', 'Position:', 'Abrechnungszeitraum:', 'Betrag:'] as $prefix) {
            if (str_starts_with($line, $prefix)) return true;
        }

        return false;
    }

    private function compactAllocationDetailLine(string $line): string
    {
        $line = $this->withoutTrailingPercentage(trim($line));
        if ($line === '') return '';

        if (preg_match('/^Schlüssel:\s*([^:]+):\s*(.+)$/u', $line, $matches)) {
            return 'Schlüssel: '.trim($matches[1]).' · '.trim($matches[2]);
        }

        return $line;
    }

    private function directAllocationLine(array $cost): ?string
    {
        return match ((string) ($cost['allocationKey'] ?? '')) {
            'direct_unit' => 'Direkte Einheitszuordnung',
            'contract' => 'Direkte Vertragszuordnung',
            default => null,
        };
    }

    private function allocationCalculationLine(array $cost): ?string
    {
        $key = (string) ($cost['allocationKey'] ?? '');
        $factor = (float) ($cost['factor'] ?? 0);
        if ($factor <= 0) return null;

        return match ($key) {
            'direct_unit' => 'Direkte Einheitszuordnung',
            'contract' => 'Direkte Vertragszuordnung',
            'living_area' => 'Schlüssel: Wohnfläche',
            'persons', 'person_days' => 'Schlüssel: Personentage',
            'units' => 'Schlüssel: Einheiten',
            'residential_units' => 'Schlüssel: Wohneinheiten',
            'consumption' => 'Schlüssel: Verbrauch',
            default => null,
        };
    }

    /** @return array<int,string> */
    private function splitPdfLines(string $text): array
    {
        $parts = preg_split('/\R/u', $text) ?: [];
        $lines = [];

        foreach ($parts as $part) {
            foreach (preg_split('/\s+·\s+/u', trim((string) $part)) ?: [] as $piece) {
                $piece = trim((string) $piece);
                if ($piece !== '') {
                    $lines[] = $this->normalizeGermanTerms($piece);
                }
            }
        }

        return $lines;
    }

    private function hasLinePrefix(array $lines, string $prefix): bool
    {
        foreach ($lines as $line) {
            if (str_starts_with(trim((string) $line), $prefix)) {
                return true;
            }
        }

        return false;
    }

    /** @return array<int,string> */
    private function calculationLines(string $value): array
    {
        if ($value === '') {
            return [];
        }

        $parts = preg_split('/\s+x\s+/u', $value) ?: [];
        $lines = [];

        foreach ($parts as $part) {
            $line = $this->formatCalculationPart(trim((string) $part));
            if ($line !== null && $line !== '') {
                $lines[] = $line;
            }
        }

        return $lines;
    }

    private function formatCalculationPart(string $part): ?string
    {
        if ($part === '') {
            return null;
        }

        foreach (['Betrag:' => 'Grundbetrag:'] as $prefix => $label) {
            if (str_starts_with($part, $prefix)) {
                return $label.' '.trim(substr($part, strlen($prefix)));
            }
        }

        if (str_starts_with($part, 'Zeit:')) {
            $value = trim(substr($part, strlen('Zeit:')));

            if (preg_match('/^(\d+)\/(\d+)$/', $value, $matches)) {
                return (int) $matches[1] === (int) $matches[2]
                    ? null
                    : "Zeitanteil: {$matches[1]} von {$matches[2]} Tagen";
            }

            return 'Zeitanteil: '.$value;
        }

        $map = [
            'Wohnflaeche:' => ['Schlüssel: Wohnfläche', 'm²'],
            'Wohnfläche:' => ['Schlüssel: Wohnfläche', 'm²'],
            'Personentage:' => ['Schlüssel: Personentage', 'P-Tage'],
            'Verbrauch:' => ['Schlüssel: Verbrauch', null],
            'Wohneinheiten:' => ['Schlüssel: Wohneinheiten', 'Wohnungen'],
        ];

        foreach ($map as $prefix => [$label, $unit]) {
            if (str_starts_with($part, $prefix)) {
                return $label.': '.$this->formatRatio(trim(substr($part, strlen($prefix))), $unit);
            }
        }
        if (str_starts_with($part, 'Einheitenanteil:')) {
            return 'Anteil nach Einheiten: '.trim(substr($part, strlen('Einheitenanteil:')));
        }

        return $part === 'Einzelvertrag' ? 'Direkte Vertragszuordnung' : $part;
    }

    private function allocationKeyLabel(string $source): ?string
    {
        $source = mb_strtolower($source);

        return match (true) {
            str_contains($source, 'wohneinheiten') => 'Wohneinheiten',
            str_contains($source, 'wohnflaeche') || str_contains($source, 'wohnfläche') => 'Wohnfläche',
            str_contains($source, 'personentage') => 'Personentage',
            str_contains($source, 'verbrauch') => 'Verbrauch',
            str_contains($source, 'einheitenanteil') => 'Einheiten',
            str_contains($source, 'einzelvertrag') => 'Direkte Vertragszuordnung',
            default => null,
        };
    }

    private function formatRatio(string $value, ?string $fallbackUnit = null): string
    {
        $ratio = trim($value);

        if (preg_match('/^(.*?)\s*\((.*?)\)$/u', $value, $matches)) {
            $ratio = trim($matches[1]);
        }

        if (! preg_match('/^([0-9,.]+)\/([0-9,.]+)(?:\s+(.+))?$/u', $ratio, $matches)) {
            return $this->withoutTrailingPercentage(trim($ratio));
        }

        $own = $this->displayDecimal($matches[1]);
        $total = $this->displayDecimal($matches[2]);
        $unit = $this->displayUnit(trim((string) ($matches[3] ?? '')) ?: $fallbackUnit);

        if ($unit === 'Wohnungen') {
            return "{$own} von {$total} Wohnungen";
        }
        if ($unit !== '') {
            return "{$own} {$unit} von {$total} {$unit}";
        }

        return "{$own} von {$total}";
    }

    private function withoutTrailingResult(string $line): string
    {
        $line = trim($line);
        $line = preg_replace('/\s*=\s*[0-9.,]+\s*(?:EUR|€)\s*$/u', '', $line) ?: $line;

        return trim($line);
    }

    private function withoutTrailingPercentage(string $line): string
    {
        $line = trim($line);
        $line = preg_replace('/\s*=\s*[0-9.,]+\s*%\s*$/u', '', $line) ?: $line;
        $line = preg_replace('/\s*\([0-9.,]+\s*%\)\s*$/u', '', $line) ?: $line;

        return trim($line);
    }

    private function isFullPeriodLine(string $line): bool
    {
        return (bool) preg_match('/365\s+von\s+365\s+Tagen/u', $line)
            || (bool) preg_match('/365\/365/u', $line);
    }

    private function displayUnit(?string $unit): string
    {
        $unit = trim((string) $unit);

        return match (mb_strtolower($unit)) {
            'm2', 'qm', 'm²' => 'm²',
            'm3', 'cbm', 'm³' => 'm³',
            default => $unit,
        };
    }

    private function displayDecimal(string $value): string
    {
        $value = trim($value);
        if ($value === '') return '';

        if (str_contains($value, ',') && str_contains($value, '.')) {
            $value = str_replace('.', '', $value);
        }

        return OperatingCostDisplayFormatter::number(str_replace(',', '.', $value), 2);
    }

    private function coverInfo(): array
    {
        return [
            ['label' => 'Objekt', 'value' => $this->objectLine()],
            ['label' => 'Einheit', 'value' => $this->unitLabel()],
            ['label' => 'Abrechnungszeitraum', 'value' => $this->dateRange((array) ($this->data['period'] ?? []))],
            ['label' => 'Nutzungszeitraum', 'value' => $this->dateRange((array) ($this->data['usagePeriod'] ?? []))],
            ['label' => 'Erstellt am', 'value' => $this->date($this->data['createdOn'] ?? null)],
            ['label' => 'Referenz', 'value' => (string) ($this->data['reference'] ?? '-')],
        ];
    }

    private function detailInfo(): array
    {
        return [
            ['label' => 'Einheit', 'value' => $this->unitLabel()],
            ['label' => 'für', 'value' => $this->tenantLabel()],
            ['label' => 'Abrechnungszeitraum', 'value' => $this->dateRange((array) ($this->data['period'] ?? []))],
        ];
    }

    private function tenantLabel(): string
    {
        $names = collect((array) data_get($this->data, 'recipient.names', []))
            ->map(fn ($name): string => trim((string) $name))
            ->filter()
            ->values();
        if ($names->isNotEmpty()) return $names->join(', ');

        $tenant = data_get($this->data, 'contract.tenant');
        if (is_array($tenant)) {
            return collect($tenant)->map(fn ($name): string => trim((string) $name))->filter()->join(', ') ?: '-';
        }

        return trim((string) $tenant) ?: '-';
    }

    private function objectLine(): string
    {
        $number = trim((string) data_get($this->data, 'property.number'));
        $name = trim((string) data_get($this->data, 'property.name'));
        $address = trim((string) data_get($this->data, 'property.address'));
        $parts = [];

        if ($number !== '') $parts[] = $number;
        if ($name !== '' && ! $this->sameDisplayValue($name, $number)) $parts[] = $name;
        if ($parts === [] && $address !== '') $parts[] = $address;

        return trim(collect($parts)->filter()->join(' · ')) ?: '-';
    }

    private function unitLabel(): string
    {
        $number = trim((string) data_get($this->data, 'unit.number'));
        $name = trim((string) data_get($this->data, 'unit.name'));
        $propertyName = trim((string) data_get($this->data, 'property.name'));
        $propertyAddress = trim((string) data_get($this->data, 'property.address'));
        $parts = [];

        if ($number !== '') $parts[] = $number;
        if ($name !== ''
            && ! $this->sameDisplayValue($name, $number)
            && ! $this->sameDisplayValue($name, $propertyName)
            && ! $this->containsDisplayValue($propertyAddress, $name)) {
            $parts[] = $name;
        }

        return trim(collect($parts)->filter()->join(' · ')) ?: '-';
    }

    private function sameDisplayValue(string $left, string $right): bool
    {
        $left = $this->normalizedDisplayValue($left);
        $right = $this->normalizedDisplayValue($right);

        return $left !== '' && $right !== '' && $left === $right;
    }

    private function containsDisplayValue(string $haystack, string $needle): bool
    {
        $haystack = $this->normalizedDisplayValue($haystack);
        $needle = $this->normalizedDisplayValue($needle);

        return $haystack !== '' && $needle !== '' && str_contains($haystack, $needle);
    }

    private function normalizedDisplayValue(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = str_replace(['ä', 'ö', 'ü', 'ß'], ['ae', 'oe', 'ue', 'ss'], $value);
        $value = preg_replace('/[^a-z0-9]+/u', '', $value) ?: '';

        return $value;
    }

    private function dateRange(array $range): string
    {
        return $this->date($range['from'] ?? null).' - '.$this->date($range['until'] ?? null);
    }

    private function date(mixed $value): string
    {
        if (! $value) return '-';
        $time = strtotime((string) $value);
        return $time ? date('d.m.Y', $time) : (string) $value;
    }

    private function money(float $value): string
    {
        return OperatingCostDisplayFormatter::money($value);
    }

    private function number(mixed $value): string
    {
        return OperatingCostDisplayFormatter::number($value, 2);
    }

    private function percent(float $value): string
    {
        return OperatingCostDisplayFormatter::percent($value);
    }

    private function wrap(string $text, float $width, float $size): array
    {
        $this->font('', $size);
        $paragraphs = preg_split('/\R/u', trim($text)) ?: [];
        $lines = [];

        foreach ($paragraphs as $paragraph) {
            $words = preg_split('/[^\S\r\n]+/u', trim($paragraph)) ?: [];
            $words = array_values(array_filter($words, fn (string $word): bool => $word !== ''));
            if ($words === []) continue;

            $line = '';
            foreach ($words as $word) {
                $candidate = $line === '' ? $word : $line.' '.$word;
                if ($this->GetStringWidth($this->encode($candidate)) <= $width) {
                    $line = $candidate;
                } else {
                    if ($line !== '') $lines[] = $line;
                    $line = $word;
                }
            }
            if ($line !== '') $lines[] = $line;
        }

        return $lines ?: [''];
    }

    private function containsAny(string $haystack, array $needles): bool
    {
        foreach ($needles as $needle) if (str_contains($haystack, $needle)) return true;
        return false;
    }

    private function drawRule(float $y): void
    {
        $this->SetDrawColor(...self::LINE_RGB);
        $this->Line(self::LEFT, $y, self::LEFT + self::CONTENT_W, $y);
    }

    private function setFill(array $rgb): void
    {
        $this->SetFillColor($rgb[0], $rgb[1], $rgb[2]);
    }

    private function font(string $style, float $size, array $rgb = [0, 0, 0]): void
    {
        $this->SetFont('Arial', $style, $size);
        $this->SetTextColor($rgb[0], $rgb[1], $rgb[2]);
    }

    private function encode(string $value): string
    {
        if ($value === '' || ! preg_match('/[^\x00-\x7F]/', $value)) return $value;
        $converted = @iconv('UTF-8', 'Windows-1252//TRANSLIT', $value);

        return $converted !== false ? $converted : $value;
    }
}
