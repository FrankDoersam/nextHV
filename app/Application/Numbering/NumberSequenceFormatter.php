<?php

namespace App\Application\Numbering;

use App\Models\NumberSequence;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

final class NumberSequenceFormatter
{
    private const DATE_TOKENS = ['YYYY', 'YY', 'MM', 'DD'];

    /** @param array<int, string> $contextTokens */
    public function validate(
        string $prefix,
        string $pattern,
        string $resetPolicy,
        array $contextTokens,
    ): void {
        $errors = [];

        if (! in_array($resetPolicy, NumberSequence::RESET_POLICIES, true)) {
            $errors['resetPolicy'][] = 'Ungültige Rücksetzlogik.';
        }
        if (mb_strlen($prefix) > 40) {
            $errors['prefix'][] = 'Das Präfix darf maximal 40 Zeichen enthalten.';
        }
        if (preg_match('/[{}\r\n\t]/u', $prefix)) {
            $errors['prefix'][] = 'Das Präfix darf keine Platzhalter, Zeilenumbrüche oder Steuerzeichen enthalten.';
        }
        if ($pattern === '' || mb_strlen($pattern) > 120) {
            $errors['pattern'][] = 'Das Format muss zwischen 1 und 120 Zeichen lang sein.';
        }
        if (preg_match('/[\r\n\t]/u', $pattern)) {
            $errors['pattern'][] = 'Das Format darf keine Zeilenumbrüche oder Steuerzeichen enthalten.';
        }
        if (preg_match_all('/\{SEQ(?::([1-9]\d?))?\}/', $pattern) !== 1) {
            $errors['pattern'][] = 'Das Format muss genau einen {SEQ}- oder {SEQ:n}-Platzhalter enthalten.';
        }

        preg_match_all('/\{([^{}]+)\}/u', $pattern, $matches);
        $allowedLiteralTokens = [...self::DATE_TOKENS, ...$contextTokens];
        $unsupported = collect($matches[1] ?? [])
            ->reject(static fn (string $token): bool => preg_match('/^SEQ(?::[1-9]\d?)?$/', $token) === 1)
            ->reject(static fn (string $token): bool => in_array($token, $allowedLiteralTokens, true))
            ->unique()
            ->values();

        if ($unsupported->isNotEmpty()) {
            $errors['pattern'][] = 'Unbekannte Platzhalter: '.$unsupported
                ->map(fn (string $token): string => '{'.$token.'}')
                ->join(', ').'.';
        }

        $withoutTokens = preg_replace('/\{[^{}]+\}/u', '', $pattern) ?? $pattern;
        if (str_contains($withoutTokens, '{') || str_contains($withoutTokens, '}')) {
            $errors['pattern'][] = 'Das Format enthält einen unvollständigen oder verschachtelten Platzhalter.';
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * @param array<string, string> $context
     * @param array<int, string> $contextTokens
     */
    public function render(
        string $prefix,
        string $pattern,
        int $value,
        CarbonImmutable $date,
        array $context,
        array $contextTokens,
        int $maxLength = 80,
    ): string {
        $replacements = [
            '{YYYY}' => $date->format('Y'),
            '{YY}' => $date->format('y'),
            '{MM}' => $date->format('m'),
            '{DD}' => $date->format('d'),
        ];

        foreach ($contextTokens as $token) {
            $replacements['{'.$token.'}'] = $this->sanitizeContextValue((string) ($context[$token] ?? $token));
        }

        $rendered = strtr($pattern, $replacements);
        $rendered = preg_replace_callback(
            '/\{SEQ(?::([1-9]\d?))?\}/',
            static function (array $match) use ($value): string {
                $width = isset($match[1]) ? (int) $match[1] : 0;

                return $width > 0
                    ? str_pad((string) $value, $width, '0', STR_PAD_LEFT)
                    : (string) $value;
            },
            $rendered,
        ) ?? $rendered;

        $number = $prefix.$rendered;
        if (mb_strlen($number) > $maxLength) {
            throw ValidationException::withMessages([
                'pattern' => "Die erzeugte Nummer überschreitet die zulässige Länge von {$maxLength} Zeichen.",
            ]);
        }

        return $number;
    }

    private function sanitizeContextValue(string $value): string
    {
        $value = trim($value);
        $value = preg_replace('/[^A-Za-z0-9._-]+/u', '-', $value) ?? $value;

        return trim($value, '-') ?: 'X';
    }
}
