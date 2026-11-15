<?php

namespace App\Framework;

use InvalidArgumentException;

final readonly class ImportDefinition
{
    /**
     * @param  list<string>  $fields  Explicit write allow-list.
     * @param  array<string, list<string>>  $relations  Belongs-to name => match fields.
     * @param  array<string, list<string>>  $aliases  Alternate CSV headings by field.
     */
    public function __construct(public array $fields, public array $relations = [], public array $aliases = [])
    {
        if ($fields === [] || array_diff(array_keys($aliases), $fields)) {
            throw new InvalidArgumentException('Import fields must be explicit and aliases must reference an allowed field.');
        }
    }

    public function toArray(): array
    {
        return get_object_vars($this);
    }
}
