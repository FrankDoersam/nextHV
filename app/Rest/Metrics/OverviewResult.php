<?php

namespace App\Rest\Metrics;

use Lomkit\Rest\Metrics\MetricResult;

final readonly class OverviewResult implements MetricResult
{
    public function __construct(private array $values) {}

    public function jsonSerialize(): array
    {
        return $this->values;
    }
}
