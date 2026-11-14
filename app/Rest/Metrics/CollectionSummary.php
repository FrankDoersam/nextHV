<?php

namespace App\Rest\Metrics;

use Closure;
use Illuminate\Database\Eloquent\Builder;
use Lomkit\Rest\Metrics\Metric;
use Lomkit\Rest\Metrics\MetricResult;

/** Declared calculations receive the native, authorized and filtered REST query. */
final class CollectionSummary extends Metric
{
    public ?string $uriKey = 'summary';

    /** @param array<string, Closure(Builder): int|float|null> $calculations */
    public function __construct(private readonly array $calculations) {}

    public function type(): string
    {
        return 'summary';
    }

    public function calculate(Builder $query): MetricResult
    {
        $values = [];
        foreach ($this->calculations as $key => $calculate) {
            $values[$key] = $calculate((clone $query)->reorder());
        }

        return new OverviewResult($values);
    }
}
