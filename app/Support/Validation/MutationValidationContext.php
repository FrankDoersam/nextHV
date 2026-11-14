<?php

namespace App\Support\Validation;

use Illuminate\Http\Request;
use Lomkit\Rest\Mutations\MutationNode;

/** Request-local traversal state; no mutable state survives a request or queue worker cycle. */
final class MutationValidationContext
{
    private const string ATTRIBUTE = 'nexthv.validation.mutations';

    /** @param list<string> $fields */
    public static function enter(Request $request, MutationNode $node, array $fields): void
    {
        $stack = $request->attributes->get(self::ATTRIBUTE, []);
        $stack[] = ['path' => $node->path, 'depth' => $node->depth, 'fields' => $fields];
        $request->attributes->set(self::ATTRIBUTE, $stack);
    }

    public static function leave(Request $request): void
    {
        $stack = $request->attributes->get(self::ATTRIBUTE, []);
        array_pop($stack);
        $request->attributes->set(self::ATTRIBUTE, $stack);
    }

    /**
     * @param  array<string, list<string>>  $errors
     * @return array<string, list<string>>
     */
    public static function errors(Request $request, array $errors): array
    {
        $stack = $request->attributes->get(self::ATTRIBUTE, []);
        $current = end($stack);
        if (! $current || $current['depth'] === 0 || $current['path'] === '') {
            return $errors;
        }

        $mapped = [];
        foreach ($errors as $field => $messages) {
            $key = ! str_contains($field, '.') && in_array($field, $current['fields'], true)
                ? $current['path'].'.attributes.'.$field
                : $field;
            $mapped[$key] = array_values(array_unique([...($mapped[$key] ?? []), ...$messages]));
        }

        return $mapped;
    }
}
