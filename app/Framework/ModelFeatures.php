<?php

namespace App\Framework;

use InvalidArgumentException;

/** Immutable, opt-in capabilities beside the model; REST owns types and validation. */
final class ModelFeatures
{
    private array $definition = ['search' => null, 'audit' => [], 'import' => null];

    public static function make(): self
    {
        return new self;
    }

    public function label(string $label): self
    {
        return $this->with('label', $label);
    }

    /** @param list<string> $subtitle */
    public function search(array $subtitle = [], ?string $title = null, int $limit = 10, int $priority = 0): self
    {
        if ($limit < 1 || $limit > 50) {
            throw new InvalidArgumentException('Search limit must be between 1 and 50.');
        }

        return $this->with('search', compact('subtitle', 'title', 'limit', 'priority'));
    }

    /**
     * @param  list<string>  $fields
     * @param  list<string>  $events
     */
    public function audit(array $fields, array $events = ['created', 'updated', 'deleted', 'restored']): self
    {
        if (array_diff($events, ['created', 'updated', 'deleted', 'restored'])) {
            throw new InvalidArgumentException('Unknown audit event.');
        }

        return $this->with('audit', array_values(array_unique($fields)))->with('audit_events', $events);
    }

    /**
     * @param  list<string>  $fields  Explicit write allow-list, never inferred from guarded/fillable.
     * @param  array<string, list<string>>  $relations  Eloquent belongs-to name => allowed match fields.
     * @param  array<string, list<string>>  $aliases  Alternate CSV headings by field.
     */
    public function import(array $fields, array $relations = [], array $aliases = []): self
    {
        if ($fields === [] || array_diff(array_keys($aliases), $fields)) {
            throw new InvalidArgumentException('Import fields must be explicit and aliases must reference an allowed field.');
        }

        return $this->with('import', compact('fields', 'relations', 'aliases'));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->definition;
    }

    private function with(string $key, mixed $value): self
    {
        $next = clone $this;
        $next->definition[$key] = $value;

        return $next;
    }
}
