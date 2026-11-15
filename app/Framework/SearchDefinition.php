<?php

namespace App\Framework;

use InvalidArgumentException;

final readonly class SearchDefinition
{
    /** @param list<string> $subtitle */
    public function __construct(public array $subtitle = [], public ?string $title = null, public int $limit = 10, public int $priority = 0)
    {
        if ($limit < 1 || $limit > 50) {
            throw new InvalidArgumentException('Search limit must be between 1 and 50.');
        }
    }

    public function toArray(): array
    {
        return get_object_vars($this);
    }
}
