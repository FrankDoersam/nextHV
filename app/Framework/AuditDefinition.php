<?php

namespace App\Framework;

use InvalidArgumentException;

final readonly class AuditDefinition
{
    /**
     * @param  list<string>  $fields  Stored model attributes only.
     * @param  list<string>  $events  Eloquent events, not UI operations.
     */
    public function __construct(public array $fields, public array $events = ['created', 'updated', 'deleted', 'restored'], public ?string $stream = null)
    {
        if (array_diff($events, ['created', 'updated', 'deleted', 'restored'])) {
            throw new InvalidArgumentException('Unknown audit event.');
        }
        foreach ($fields as $field) {
            if (! is_string($field) || ! preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D', $field)) {
                throw new InvalidArgumentException('Audit fields must be stored attribute names.');
            }
        }
        if ($stream !== null && ! preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $stream)) {
            throw new InvalidArgumentException('Invalid audit stream.');
        }
    }
}
