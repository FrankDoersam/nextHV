<?php

namespace App\Services\Documents;

use Illuminate\Support\Arr;

final class TemplatePlaceholderEngine
{
    public function render(string $value, array $context, array &$missing = []): string
    {
        return (string) preg_replace_callback(
            '/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/u',
            function (array $match) use ($context, &$missing): string {
                $path = $match[1];
                $resolved = data_get($context, $path);

                if ($resolved === null || $resolved === '') {
                    $missing[$path] = $path;
                    return '';
                }

                if (is_bool($resolved)) return $resolved ? 'Ja' : 'Nein';
                if (is_scalar($resolved)) return (string) $resolved;

                return '';
            },
            $value,
        );
    }

    public function paths(array $template): array
    {
        $paths = [];
        $walk = function (mixed $value) use (&$walk, &$paths): void {
            if (is_string($value)) {
                preg_match_all('/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/u', $value, $matches);
                foreach ($matches[1] ?? [] as $path) $paths[$path] = $path;
                return;
            }
            if (is_array($value)) foreach ($value as $child) $walk($child);
        };
        $walk($template);

        return array_values($paths);
    }

    public function missing(array $template, array $context): array
    {
        return collect($this->paths($template))
            ->filter(fn (string $path): bool => ($value = data_get($context, $path)) === null || $value === '')
            ->values()
            ->all();
    }

    public function withItem(array $context, mixed $item, int $index): array
    {
        return [
            ...$context,
            'item' => is_array($item) ? $item : ['value' => $item],
            'index' => $index + 1,
        ];
    }
}
